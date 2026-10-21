"""Stella (female Weimaraner healer), Toybox line: the model (round 4 shapes, Option C with blue eyes) in the Sun Oracle
costume (phase 3: Option B "Midday", refs/sheet-sun.png: saffron, sunset red, warm white, amber; painted suns), plus her prop,
the sun wagasa. Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_stella-toy.py [-- --head-only]
    python build_stella-toy.py --tune          (plain Python: prints the head field's profile / widths, then stops)

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/stella-toy.glb and public/models/stella-parasol.glb (--head-only writes scratch/ instead).

Technique (the Poe / Moka / Foosy / Floofy toy-line machinery):
- The head is ONE smooth implicit ball: a round superellipse skull, full cheeks, a short Weimaraner muzzle bun with a chin,
  a soft nose button, with a set-in socket warp for each eye. The skin is the field's zero surface reached by radial
  projection (CDT in a stereographic domain, with edge loops round the eyelids, nose and mouth), so every vertex carries
  its analytic normal. Adaptive refinement adds points where the game's hard toon band would zigzag.
- The mouth is SCULPTED, not painted: a soft groove along the closed smile (steep upper wall, gentle lower wall, an
  upper-lip roll), and the skin is cut along the groove bottom so the rig's jaw can open it.
- The eyes are separate lens globes following the ball, facing about 30 deg outward.
- The ears are thick swept drapes (pillow sections with rounded rims) hanging from the top-sides of the skull.
- The robe is lathed and thickened shells (scalloped bell hems), swept bands (collar, obi, bow) and SDF star meshes;
  limbs are SDF ring stacks.
- One 2048 painted atlas: face and eyes painted from 3D positions, 2-D shade x tone charts (fur, ears, periwinkle, pink),
  and 1-D shading ramps for everything else.
- The jellyfish parasol is its own prop (a small atlas plus a *glow* material), exported separately.
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
MODEL = MODELS + '/stella-toy.glb'
PROP_MODEL = MODELS + '/stella-parasol.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'stella-head-test.glb') if HEAD_ONLY else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
np.random.seed(11)
if not TUNE: bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
# ---- proportions (measurements.json). The sheet says 1.10 m and 2.4 heads, but draws 3.2 heads; the brief also asks for her to be
# slightly taller than chewy-b (crown 1.20 m). T_CROWN is that one choice; the head is built at 2.4 heads (crown to chin) with the
# head close-up's face fractions, and the body below the chin follows the turnaround (heights x BZS, widths x BXS).
T_CROWN = 1.240
HEADS = 2.40
W = round(.966 * T_CROWN / HEADS, 3)       # head width at the cheeks (close-up W/H 0.966)
CROWN_W = 1.035                           # crown above the chin, in W (close-up)
CHIN = round(T_CROWN - CROWN_W * W, 4); HY = -.020
SHEET_CHIN_T = .6897                      # the turnaround's chin, as a fraction of its crown height
BZS = CHIN / (SHEET_CHIN_T * T_CROWN)     # body heights: sheet fraction x T_CROWN x BZS
BXS = .92                                 # body widths and depths: sheet fraction x T_CROWN x BXS (a little slimmer)
LIFT = 1.050                              # round 2: the body is lengthened 5% so the collar and pearls sit right under the chin (no neck stalk)
def BZ(t): return t * T_CROWN * BZS * LIFT # a turnaround height fraction -> metres
def BX(t): return t * T_CROWN * BXS        # a turnaround width / depth fraction -> metres
LOG = {'T_CROWN': T_CROWN, 'W': W, 'CHIN': CHIN, 'BZS': round(BZS, 4), 'BXS': BXS, 'LIFT': LIFT}
BEADS = 2                                 # sea-glass beads on the obi (the brief and the 3/4 view: 2; the sheet's front view draws 3)

PAL = {'fur': '#A8A6AA', 'furlight': '#CFCDD1', 'furdark': '#84828A',          # round 2: the brief's values, nudged cooler with a faint mauve
       'lfur': '#BEBCC0', 'lfurlight': '#DAD8DC', 'lfurdark': '#9E9CA2',
       # phase 3, the Sun Oracle (Option B "Midday", refs/sheet-sun.png): the keys keep their old names (the meshes' UVs are unchanged)
       'peri': '#F0C24E', 'perilight': '#F4CC60', 'peridark': '#D49A33',          # saffron: the wrap top, the bell sleeves, the outer skirt
       'pink': '#D9573E', 'pinklight': '#E36D4E', 'pinkdark': '#B7432F',          # sunset red: the obi, its knot and tails, the bow, the collar
       'pearl': '#DFA23C', 'pearllight': '#EDBD60', 'pearldark': '#B47823',       # amber: the necklace beads
       'glass': '#DFA23C', 'glasslight': '#EEC066', 'glassdark': '#B07222',       # amber: the two obi beads
       'petti': '#FFF9EC', 'pettilight': '#FFFBF3', 'pettidark': '#E8D8BC',       # warm white: the petticoats, the cuffs (never pure white)
       'motif': '#FFF9EC',                                                        # the painted suns and sun rays
       'nose': '#8F7474', 'nosehi': '#A88A8A', 'nosedark': '#6F5456', 'nostril': '#5C4448',   # rig fix: the sheet's dusty mauve (was #573F42 / #86636A / #3E2C30: chocolate in the game)
       'iris': '#7FB2E0', 'irisrim': '#3F6F9F', 'irisglow': '#B8D8F2', 'pupil': '#2A2230',
       'sclera': '#FFF6EA', 'lash': '#2A2230', 'brow': '#8E8984', 'blush': '#E6A2B2', 'shadow': '#DDA9BC',
       'innerear': '#DDB0B8', 'groove': '#4E4247', 'dark': '#2A2230'}
CHARTS = {'head': (0, 768, 1280, 1280), 'eye.L': (1280, 1664, 384, 384), 'eye.R': (1664, 1664, 384, 384),
          'ramp': (1280, 1152, 768, 512), 'furmix': (1280, 896, 256, 256), 'earmix': (1536, 896, 256, 256),
          'perimix': (1792, 896, 256, 256), 'pinkmix': (1280, 640, 256, 256), 'glassmix': (1536, 640, 256, 256),
          'robe': (0, 0, 1024, 512), 'skirt': (0, 512, 1024, 256), 'sleeve.L': (1024, 320, 512, 320), 'sleeve.R': (1536, 320, 512, 320),
          'spare': (1024, 0, 1024, 320)}
if RIG:
    CHARTS.update({'lidU': (1024, 0, 512, 192), 'lidD': (1024, 192, 512, 128), 'cavity': (1536, 0, 128, 128), 'tongue': (1664, 0, 128, 128)})
PAINT_OPTS = {'lash': True, 'blush': True}
RAMPS = {'fur': ('furdark', 'fur', 'furlight'), 'lfur': ('lfurdark', 'lfur', 'lfurlight'),
         'peri': ('peridark', 'peri', 'perilight'), 'pink': ('pinkdark', 'pink', 'pinklight'),
         'pearl': ('pearldark', 'pearl', 'pearllight'), 'glass': ('glassdark', 'glass', 'glasslight'),
         'nose': ('nosedark', 'nose', '#9C8080'), 'eyedark': ('#1E1A24', '#2A2230', '#4A4256'),
         'white': ('#D8D2C4', '#F4EEE2', '#FFF6EA'), 'innerear': ('#B88E98', 'innerear', '#F0CED4'),
         'sheer': ('#E8D8BC', '#FFF6E6', '#FFFAF1'), 'pad': ('#7E7070', '#958888', '#B0A4A2'),
         'petti': ('pettidark', 'petti', 'pettilight')}
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
# Skull: a round superellipse dome in front view, an ellipse in depth (fuller in front), narrowing a little to the crown.
SK = dict(a=.476, zc=.545, cu=.490, cd=.470, n=2.25, n_top=3.20, bf=.425, bb=.470, taper=.12, t0=.60, t1=.92)
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
    ys = np.linspace(-1.05, .30, 340)
    P = np.stack([np.repeat(x[:, None], len(ys), 1), np.broadcast_to(ys, (n, len(ys))), np.repeat(z[:, None], len(ys), 1)], -1).reshape(-1, 3)
    ins = (f(P) < 0).reshape(n, len(ys)); i = np.argmax(ins, 1); ok = ins[np.arange(n), i]
    lo = ys[np.maximum(i - 1, 0)]; hi = ys[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(np.stack([x, m, z], -1)) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return np.where(ok, (lo + hi) / 2, np.nan)

def mirror(q):
    qa = np.array(q, float, copy=True); qa[..., 0] = np.abs(qa[..., 0]); return qa
# full soft cheeks (the widest point, 0.5 W, at about z 0.30), the short Weimaraner muzzle bun (the nose sits on its front-top,
# the lips and smile on its front), a rounded chin under it, soft brow ridges
JOWL = ([.282, -.100, .325], [.222, .255, .225]); K_JOWL = .090
LCHK = ([.245, -.200, .135], [.205, .225, .125]); K_LCHK = .090      # round 2: the full lower cheeks / jaw corners (no tapering jaw)
MUZ = [[0, -.467, .172], [.250, .250, .170]]; K_MUZ = .075
MUZB = [[0, -.400, .280], [.125, .115, .080]]; K_MUZB = .050       # the bridge under the stop, carrying the nose
JAW = [[0, -.385, .070], [.265, .260, .098]]; K_JAW = .060
BROW = ([.235, -.335, .740], [.170, .072, .060]); K_BROW = .075
NECK = [[0, .020, -.120], [.250, .225, .130]]; K_NECK = .085      # round 2: the neck reaches under the collar (no separate tube)
NAPE = [[0, .170, -.050], [.200, .200, .150]]; K_NAPE = .090     # round 2: fills the corner under the back of the skull into the neck
def muz_sdf(q): return smin(ell(q, *MUZ), ell(q, *MUZB), K_MUZB)
def base_local(q):
    d = skull(q); qm = mirror(q)
    d = smin(d, ell(qm, *JOWL), K_JOWL); d = smin(d, ell(qm, *LCHK), K_LCHK)
    d = smin(d, muz_sdf(q), K_MUZ); d = smin(d, ell(q, *JAW), K_JAW)
    return d

# eye layout (W units; the close-up): centres +-0.277 W at 0.465 W above the chin, opening 0.262 x 0.267 W
EXW, EZW, EHWW, EHHW, EN = .277, .465, .131, .134, 2.10
RECESS = dict(delta=.030, tilt=-.90, F_out=.13, F_nas=.070, F_up=.070, F_dn=.060)
def eye_recess(q):
    """the set-in socket: depth over each opening (deeper on the nose side: the eye turns outward), C2 falloff outside"""
    x, y, z = q[..., 0], q[..., 1], q[..., 2]; tot = 0
    for s in (-1, 1):
        X = s * (x - s * EXW) / EHWW; Z = (z - EZW) / EHHW
        sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN) + 1e-9
        c = X / sr; sn = Z / sr
        dout = (sr - 1) * np.sqrt((EHWW * c) ** 2 + (EHHW * sn) ** 2)
        F = np.sqrt((np.where(c > 0, RECESS['F_out'], RECESS['F_nas']) * c) ** 2 + (np.where(sn > 0, RECESS['F_up'], RECESS['F_dn']) * sn) ** 2)
        w = (1 - smoother(.012, .012 + F, dout)) * (1 - RECESS['tilt'] * np.tanh(X / 1.3))      # round 2: smooth (no kink lines on the bridge)
        tot = tot + w
    return tot * smooth(-.15, -.32, y)
def warped(q):
    qw = np.array(q, float, copy=True); qw[..., 1] = q[..., 1] - RECESS['delta'] * eye_recess(q); return qw
# nose: a soft pinkish-grey button, 0.233 W wide, 0.157 W tall, its top at the iris bottom (0.33 W), wider at the top
NZW = .252; NOSE_PW = .1165; NHW, NHH, NHD = .0960, .0830, .068; NOSE_SHEAR = .120; NOSE_WIDEN = .30; NOSE_FLAT = .15
_yf = float(front_local(0, NZW, lambda q: base_local(warped(q)))[0])
NOSE_C = np.array([0, _yf + NHD - .044, NZW])
def nose_recede(qz): return NOSE_SHEAR * smooth(-.30, 1.20, qz / NHH)          # C1 everywhere (no kinks leaking into the normals)
def nose_widen(qz): return 1 + NOSE_WIDEN * (2 * smooth(-1.4, 1.4, qz / NHH) - 1)
def nose_flat(qz): return 1 + NOSE_FLAT * smooth(0., 1., qz / NHH)
def nose_sdf(q):
    qq = np.array(q, float, copy=True) - NOSE_C
    qq[..., 1] = qq[..., 1] - nose_recede(qq[..., 2])        # the top slopes back to the stop (sheet profile); the front face below is upright
    widen = nose_widen(qq[..., 2])
    qq[..., 0] = qq[..., 0] / widen
    qq[..., 2] = qq[..., 2] * nose_flat(qq[..., 2])      # round 2: a flatter top edge (a crisper rounded triangle)
    return ell(qq, [0, 0, 0], [NHW, NHD, NHH])
K_N = .040
# round 2: the small cheek puffs the smile pushes up beside the corners, and a fuller, rounder lower lip
_pz = np.array([[.258, .224], [0., .080]]); _pyy = front_local(_pz[:, 0], _pz[:, 1], lambda q: base_local(warped(q)))
PUFF = ([.258, float(_pyy[0]) + .040, .224], [.056, .046, .050]); K_PUFF = .050
LIP = ([0, float(_pyy[1]) + .050, .082], [.120, .046, .046]); K_LIP = .035
def head_local_pre(q, neck=True):
    d = base_local(warped(q)); d = smin(d, ell(q, *LIP), K_LIP)
    if neck: d = smin(smin(d, ell(q, *NECK), K_NECK), ell(q, *NAPE), K_NAPE)
    return smin(d, nose_sdf(q), K_N)

# ---- the sculpted closed smile (a real lip parting, no painted line). W units: x, z above the chin.
# The smile: corners at +-0.230 W, 0.188 W; the centre (under the philtrum) at 0.106 W; a little upward curl at the corners.
# Round 2: the sheet's "w" (ruled crop of the front close-up, measure/ruled.py 105 670 215 740 7): the philtrum drops from the nose
# to a cusp at the centre (z 0.120 W); two smile arcs dip to z 0.106 W at x +-0.08 W and rise to the corners (x +-0.230 W,
# z 0.188 W), which curl up into small dimples (z 0.198 W).
MA_X, MA_C, MA_K, MA_P, MA_T0 = .230, .106, .064, 1.45, .35
def mouth_arch(t, crisp=False):  # t in [-1, 1] (crisp for paint; slightly rounded at the cusp for the rig loops)
    t = np.asarray(t, float); a = np.abs(t)
    rise = np.clip((a - MA_T0) / (1 - MA_T0), 0, 1) ** MA_P
    cusp = .014 * np.clip(1 - a / MA_T0, 0, 1) ** (1.5 if crisp else 1.9)
    return np.stack([MA_X * t, MA_C + MA_K * rise + cusp + .018 * smooth(.80, 1., a) ** 1.4], -1)
MG_N = 41; _mt = np.linspace(-1, 1, MG_N); _mc = mouth_arch(_mt)
MG_TAPER = 1 - .78 * smooth(.55, .98, np.abs(_mt))
MG_RG = .021 * MG_TAPER; MG_DL = .0040 * MG_TAPER; MG_SUP, MG_SDN, MG_SMID = 2.6, 1.65, 2.0
MG_YS = front_local(_mc[:, 0], _mc[:, 1], head_local_pre)                       # the un-grooved surface along the parting
MG_C = np.stack([_mc[:, 0], MG_YS - MG_DL, _mc[:, 1]], -1)                     # tube centres just in front of the surface
_ru = front_local(_mc[:, 0], _mc[:, 1] + .011, head_local_pre)
MG_R = np.stack([_mc[:, 0], _ru + .0050, _mc[:, 1] + .012], -1); MG_RR = .0125 * MG_TAPER       # the upper-lip roll (overhangs the parting)
# the philtrum: a short shallow groove from the nose to the smile centre
PH_Z = np.array([NZW - NHH + .012, MA_C + .0075 + .004]); _py = front_local(np.zeros(2), PH_Z, head_local_pre)
PH_C = np.stack([np.zeros(2), _py - .0010, PH_Z], -1); PH_R = np.array([.0090, .0105])        # round 2: a deeper philtrum groove
# the corner dimples: small round pits at the curl ends
_dc = mouth_arch(np.array([-1., 1.]), True); _dy = front_local(_dc[:, 0], _dc[:, 1], head_local_pre)
DIMPLE_C = np.stack([_dc[:, 0] * 1.02, _dy - .0085, _dc[:, 1] + .002], -1); DIMPLE_R = .0145
MG_BOX = (.30, .03, .30, -.45)                                                # |x| <, z >, z <, y < : outside it the mouth terms are zero
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
    d = smin(_chain(p, MG_C, MG_RG, scale=True), _chain(p, PH_C, PH_R) * 1.0, .006)
    for c_ in DIMPLE_C: d = smin(d, np.linalg.norm(p - c_, axis=1) - DIMPLE_R, .006)
    return d
def head_local(q, neck=True):
    d = np.array(head_local_pre(q, neck), float, copy=True); p = np.asarray(q, float).reshape(-1, 3); dv = d.reshape(-1)
    m = mouth_mask(p)
    if m.any():
        pm = p[m]; dd = smin(dv[m], _chain(pm, MG_R, MG_RR), .006)
        dv[m] = smax(dd, -groove_sdf(pm), .003)
    return dv.reshape(np.shape(d))
NOSE_TIP_L = float(front_local(0, NZW, head_local)[0])
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
def skull_sdf(p): return base_local(M2L(p)) * W
def front_hit(x, z, f=head_sdf):
    return HY + W * front_local(np.asarray(x) / W, (np.asarray(z) - CHIN) / W, lambda q: f(L2M(q)) / W)
O = np.array([0, HY - .02 * W, CHIN + .40 * W])          # round 2: lowered from 0.44 W so the bridge behind the nose top is visible from it
_g = np.stack(np.meshgrid(np.zeros(1), np.linspace(-.5, .5, 101), np.linspace(.85, 1.15, 301), indexing='ij'), -1).reshape(-1, 3)
CROWN_M = float(CHIN + W * _g[head_local(_g) < 0][:, 2].max())
LOG['crown_m'] = round(CROWN_M, 4)

def head_report():
    """the field's profile and widths against the sheet (measurements.json side_W / face_W)"""
    tgt_b = {.95: .53, .88: .436, .81: .368, .74: .334, .68: .316, .61: .30, .54: .30, .47: .291, .40: .282, .37: .265,
             .334: .214, .30: .128, .265: .026, .23: 0., .20: 0., .163: .009, .128: .026, .094: .06, .06: .068, .026: .103, -.01: .163}
    tip = float(np.nanmin(front_local(np.zeros(60), np.linspace(.15, .30, 60), head_local)))
    rows = []
    for z, b in sorted(tgt_b.items(), reverse=True):
        y = float(front_local(0, z, head_local)[0]); rows.append((z, round(y - tip, 3), b))
    widths = {}
    for zw in (.0, .10, .20, .25, .30, .40, .465, .55, .60, .65, .80, .95):
        xs_ = np.linspace(0, .7, 351); ys_ = front_local(xs_, np.full(len(xs_), zw), head_local); ok = np.isfinite(ys_)
        widths['%.3f' % zw] = round(float(2 * xs_[ok].max()), 3) if ok.any() else None
    q = np.array([[EXW, float(front_local(EXW, EZW, head_local)[0]), EZW]])
    g = np.zeros(3)
    for k in range(3):
        dp = np.zeros(3); dp[k] = 1e-4; g[k] = (head_local(q + dp) - head_local(q - dp))[0]
    g = g / np.linalg.norm(g)
    out = {'crown_W': round((CROWN_M - CHIN) / W, 3), 'crown_m': round(CROWN_M, 4), 'nose_tip_y_W': round(tip, 3), 'nose_c_y_W': round(float(NOSE_C[1]), 3),
           'profile(z, model b, sheet b)': rows, 'widths(z: model)': widths,
           'eye_axis_out_deg': round(math.degrees(math.atan2(g[0], -g[1])), 1), 'eye_axis_down_deg': round(math.degrees(math.asin(-g[2])), 1),
           'mouth_groove_y_W': [round(float(v), 3) for v in MG_YS[::6]]}
    return out
if TUNE:
    print(json.dumps(head_report(), indent=1)); sys.exit(0)

def radial_hit(d, f=head_sdf, o=O, t0=.02, t1=.52, it=32):
    lo = np.full(len(d), t0); hi = np.full(len(d), t1)
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def radial_hit_outer(d, f=head_sdf, o=O, t0=.02, t1=.52, steps=128, fine=0):
    """the outermost surface crossing along each ray from o: a 3.9 mm march, then bisection (fine > 0 adds a 0.6 mm march over the
    12 mm outside the first hit, for thin overhangs; off by default: it costs 5x and the skin needs none)"""
    ts = np.linspace(t1, t0, steps); n = len(d)
    P = o + d[:, None, :] * ts[None, :, None]
    ins = (f(P.reshape(-1, 3)) < 0).reshape(n, steps); i = np.argmax(ins, 1)
    lo = ts[i]; hi = ts[np.maximum(i - 1, 0)]
    if fine:
        dt = ts[0] - ts[1]; tf = lo[:, None] + np.linspace(3 * dt, 0, fine * 3 + 1)[None, :]
        insf = (f((o + d[:, None, :] * tf[..., None]).reshape(-1, 3)) < 0).reshape(n, -1); j = np.argmax(insf, 1)
        okf = insf[np.arange(n), j] & (j > 0)
        lo = np.where(okf, tf[np.arange(n), j], lo); hi = np.where(okf, tf[np.arange(n), np.maximum(j - 1, 0)], hi)
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
    c = np.cos(psi); s = np.sin(psi); return spow(c, 2 / EN), spow(s, 2 / EN)
EYEF = {}; EYE_LAMBDA = .5; EYE_AXIS_LOCK = (32.0, -8.1)
for _s in (-1, 1):
    _Sc = np.array([_s * EX, float(front_hit(_s * EX, EZ)[0]), EZ]); _ax0 = grad_n(_Sc[None])[0]
    if EYE_AXIS_LOCK:   # round 2: the eyes are locked at round 1's axis (32.0 deg out, 8.1 deg up), whatever the cheeks around them do
        _o, _d = map(math.radians, EYE_AXIS_LOCK); _ax0 = np.array([_s * math.sin(_o) * math.cos(_d), -math.cos(_o) * math.cos(_d), -math.sin(_d)])
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
BLUSH = (.415 * W, CHIN + .290 * W, .115 * W, .085 * W)

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
    wn = (1 - .72 * smooth(-.10, -.80, np.cos(psi))) * (1 - .45 * smooth(-.20, -.90, np.sin(psi)))
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
pts.append(tuple(to_dom(surf_dir(np.array([0.]), np.array([NZ])))[0])); tags['nose_c'] = [len(pts) - 1]
for k, (rx, rz, n) in enumerate([(.034, .024, 12), (.064, .044, 18), (.092, .064, 26), (.112, .078, 30), (.128, .090, 34)]):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    widen = nose_widen(np.sin(a) * rz)
    add_loop(to_dom(surf_dir(rx * W * np.cos(a) * widen, NZ + rz * W * np.sin(a) * np.where(np.sin(a) > 0, .82, 1.))), 'nose_%d' % k)   # round 2: the top loops stay on the nose (off the crease)
def arch_ud(up0, dn0, n=MG_N, ncap=4, taper=False):
    """closed loop round the parting: offset `up` above and `dn` below it (W units), round caps at the corners -> (x, z) metres.
    taper: the loop narrows toward the corners with the groove (the mid-wall and rim loops follow the tapered walls)"""
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
for k, (up_, dn_) in enumerate([(.0045, .0050), (.0095, .0100), (.0175, .0190), (.0250, .0270), (.0350, .0370)]):
    L = arch_ud(up_, dn_, taper=k < 2)
    _i0 = len(pts); add_loop(to_dom(surf_dir(L[:, 0], L[:, 1])), 'mouth_%d' % k)
    if k == 0: SIDE_PT.update({_i0 + j: sd_ for j, sd_ in enumerate(ARCH_SIDE[0])})
_pp = mouth_arch(np.linspace(-1, 1, MG_N)) * W + np.array([0, CHIN])
add_loop(to_dom(surf_dir(_pp[:, 0], _pp[:, 1])), 'part', closed=False)          # the lip parting (the cut line)
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
    return ((np.abs(q[:, 0]) < .55) & (q[:, 2] > -.02) & (q[:, 2] < .82)) & (P[:, 1] < HY - .10 * W)
D = np.concatenate([D[~fine_zone(Pf)], D2[fine_zone(P2)]]); Pf = np.concatenate([Pf[~fine_zone(Pf)], P2[fine_zone(P2)]])
# the chin and under-jaw: rays from the head centre graze them, so they get a regular grid sampled from the front
gx, gz = np.meshgrid(np.linspace(-.30, .30, 25) * W, CHIN + np.linspace(-.12, .07, 12) * W)
gx = gx.ravel(); gz = gz.ravel(); gy = front_hit(gx, gz); okg = np.isfinite(gy)
G = np.stack([gx, gy, gz], -1)[okg]; Dg = unit(G - O)
zone = (np.abs(Pf[:, 0]) < .31 * W) & (Pf[:, 2] < CHIN + .075 * W) & (Pf[:, 1] < HY - .02)
D = np.concatenate([D[~zone], Dg]); Pf = np.concatenate([Pf[~zone], radial_hit_outer(Dg)]); keep = np.ones(len(D), bool)
# round 2: the muzzle top and the stop face up, so rays from the head centre graze them too: a regular grid sampled from the front
gx, gz = np.meshgrid(np.linspace(-.27, .27, 23) * W, CHIN + np.linspace(.26, .44, 11) * W)
gx = gx.ravel(); gz = gz.ravel(); gy = front_hit(gx, gz); okg = np.isfinite(gy)
Gm_ = np.stack([gx, gy, gz], -1)[okg]; Dm_ = unit(Gm_ - O)
zone = (np.abs(Pf[:, 0]) < .28 * W) & (Pf[:, 2] > CHIN + .25 * W) & (Pf[:, 2] < CHIN + .45 * W) & (Pf[:, 1] < HY - .30 * W)
D = np.concatenate([D[~zone], Dm_]); Pf = np.concatenate([Pf[~zone], radial_hit_outer(Dm_)]); keep = np.ones(len(D), bool)
dom = to_dom(D)
for s in (-1, 1):
    c, base = eye_dom[s]
    outer = np.array([pts[i] for i in tags['eye%d_%d' % (s, len(EYE_SCALES) - 1)]])
    keep &= ~in_poly(c + (dom - c) / 1.06, outer)
front = Pf[:, 1] < HY
keep &= ~(front & ((Pf[:, 0] / (.142 * W)) ** 2 + ((Pf[:, 2] - NZ) / (.102 * W)) ** 2 < 1))
_ma = mouth_arch(np.linspace(-1.12, 1.12, 64)) * W + np.array([0, CHIN])
_dm = np.min(np.hypot(Pf[:, 0:1] - _ma[None, :, 0], Pf[:, 2:3] - _ma[None, :, 1]), axis=1)
keep &= ~(front & (_dm < .044 * W) & (Pf[:, 1] < HY - .25 * W))
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

# ---- adaptive refinement for the game's hard toon band (as Poe / Moka / Floofy)
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
# ---- cut the skin along the lip parting (rig-ready: the jaw opens it). The interior parting vertices are split: the faces
# below the parting take a copy (2 microns behind, so nothing welds them); the two corner vertices stay shared, so the corners
# are sealed at every jaw value. At rest the two sides coincide, with identical normals: no visible seam.
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
              'note': 'Stella_head is cut along the parting (upper and lower copies of the interior vertices; the corners are shared). '
                      'The head interior behind the mouth is empty: room for the rig-time mouth cavity and tongue, as on Floofy and Poe.'}
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
_tri = [(f[0], f[i], f[i + 1]) for f in faces for i in range(1, len(f) - 1)]; _T = np.array(_tri)
_fn = unit(np.cross(verts_np[_T[:, 1]] - verts_np[_T[:, 0]], verts_np[_T[:, 2]] - verts_np[_T[:, 0]])); _vn = unit(vnorm[_T].sum(1))
_dev = np.degrees(np.arccos(np.clip((_fn * _vn).sum(1), -1, 1))); _qc = M2L(verts_np[_T].mean(1))
_fr = (_qc[:, 1] < -.15) & (_T < len(skin_p)).all(1)          # the CDT skin only (not the lid rolls)
def _cnt(m): return [int((m & (_dev > 30)).sum()), int((m & (_dev > 60)).sum()), int((m & (_dev > 90)).sum())]
LOG['skin_folds_dev30'] = {'bridge(|x|<.30, z .26-.40)': _cnt(_fr & (np.abs(_qc[:, 0]) < .30) & (_qc[:, 2] > .26) & (_qc[:, 2] < .40)),
                           'mouth(|x|<.30, z .05-.26)': _cnt(_fr & (np.abs(_qc[:, 0]) < .30) & (_qc[:, 2] > .05) & (_qc[:, 2] < .26)),
                           'chin(z<.05)': _cnt(_fr & (_qc[:, 2] < .05)), 'cheeks(|x|>.30)': _cnt(_fr & (np.abs(_qc[:, 0]) > .30)),
                           'upper(z>.40)': _cnt(_fr & (_qc[:, 2] > .40))}
print('SKIN_FOLDS', json.dumps(LOG['skin_folds_dev30']), flush=True)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)

print('STEP eyes', flush=True)
# ============================================================== EYES: flush lens globes following the ball
ES = [0, .16, .32, .48, .62, .74, .84, .92, .97, 1.10]
NSEG = 30
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
    eye_centers[tag] = [float(v) for v in (Sc - axis * .016)]
    LOG['eye_axis_' + tag] = {'out_deg': round(math.degrees(math.atan2(s * axis[0], -axis[1])), 1),
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}
print('EYE_AXIS', LOG['eye_axis_L'], LOG['eye_axis_R'], flush=True)

def ramp_sw(name, hi=.28, occ=0., add=0.):          # for sweep(): uvfn(NV, tt, uu, V)
    return lambda NV, tt, uu, V: ramp_uv(name, sval(NV, occ=occ, hi=hi) + add)
def ramp_fn(name, hi=.28, occ=0., add=0.):          # for star_mesh() / ring_stack(): uvfn(NN, V)
    return lambda NN, V, *a: ramp_uv(name, sval(NN, occ=occ, hi=hi) + add)
def mix_uv(chart, shade, tone):
    """a 2-D shade x tone chart: u = painted shade (0.5 = base), v = tone (0 .. 1, chart-specific)"""
    x, y, w, h = CHARTS[chart]; s_ = clamp(np.asarray(shade, float)); l_ = clamp(np.asarray(tone, float)) * np.ones_like(s_)
    return np.stack([(x + 8 + s_ * (w - 16)) / 2048, (y + 8 + l_ * (h - 16)) / 2048], -1)
def gradL(f, p, e=1e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
def push_out(P, clear, f, it=8):
    """move points along the field gradient until f >= clear"""
    P = np.array(P, float, copy=True); clear = np.broadcast_to(np.asarray(clear, float), (len(P),))
    for _ in range(it):
        d = f(P); need = np.maximum(clear - d, 0)
        if need.max() < 1e-6: break
        P = P + gradL(f, P) * need[:, None]
    return P

print('STEP ears', flush=True)
# ============================================================== EARS: long soft Weimaraner drapes (thick pillow sections)
# The ear is laid out by its SIDE outline (the sheet's side view: a big rounded leaf behind the eye, its nearly straight front edge
# at y ~0.05 W, its convex back edge out to y ~0.86 W, its top attached along the top-side of the skull) and then wrapped onto
# the head: x = the skull's surface at that (y, z) plus a stand-off that grows as the ear hangs (it lies on the skull at the top,
# leaves it, then hangs straight past the jaw, flaring a little outward); the middle of the section bulges out and the front
# edge turns outward so the faint pink inner side shows from the front. u runs across (-1 = the front edge, +1 = the back
# edge), v from the root to the rounded tip. W units, the left ear.
EAR_V = np.array([0, .15, .35, .55, .75, .90, 1.0])
EAR_ZC = np.array([.950, .845, .615, .340, .050, -.170, -.300])     # height of the section (its middle)
EAR_YF = np.array([-.070, -.040, .020, .060, .090, .105, .140])     # round 2: the roots come forward onto the top corners       # the front edge (side view)
EAR_YB = np.array([.200, .330, .495, .645, .670, .580, .440])        # the back edge
EAR_TILT = np.array([.150, .115, .055, .020, .000, .000, .000])     # the attach line slopes down toward the back (round 2: more, so the far ear's top stays under the crown line at 45 deg)
EAR_OFF = np.array([.000, .000, .012, .040, .068, .080, .085])       # the front edge's stand-off from the head
EAR_FAN = np.array([.000, .022, .055, .125, .170, .175, .150])       # the back edge stands out further: the ear turns toward the front
EAR_BUL = np.array([.010, .050, .100, .130, .135, .120, .090])       # the section's outward bulge
# round 3: the sheet's lobe from the front (the visible inner and outer x of the ear, W from the face centre, at heights z), less a
# little at the outer edge for the mid-surface; the model's mesh is pushed clear of the head afterwards
EAR_TZ = np.array([-.35, -.30, -.20, -.10, .00, .10, .20, .30, .40, .50, .60, .70])
EAR_IN = np.array([.590, .520, .420, .370, .355, .440, .495, .505, .515, .495, .480, .460])
EAR_OUT = np.array([.720, .800, .862, .875, .880, .875, .865, .852, .838, .812, .772, .725])
EAR_LBUL = .050
# round 4 (feedback-3): the hanging lobe. EAR_XOUT = the front-view outer outline (W, z above the chin), sheet-like but nearly vertical
# below z 0.5; EAR_FACE = how far the lobe faces forward (deg); EAR_W0 / W1 = where the hanging layout takes over from the root's
EAR_HANG = True
EAR_TZ2 = np.array([-.40, -.30, -.20, -.10, .00, .20, .36, .50, .65, .80, .90])
EAR_XOUT = np.array([.690, .785, .840, .858, .860, .840, .808, .768, .690, .580, .480])
EAR_FACE = 28.; EAR_W0, EAR_W1 = .82, .56; EAR_CURL = .060      # EAR_CURL: below the jaw the back edge curls in toward the neck
def skull_x(y, z):
    """the skull's half-width (W units) at (y, z) along +x (0 where the ray misses)"""
    y = np.asarray(y, float).ravel(); z = np.asarray(z, float).ravel(); xs = np.linspace(0, .75, 151)
    P = np.stack([np.broadcast_to(xs, (len(y), len(xs))), np.repeat(y[:, None], len(xs), 1), np.repeat(z[:, None], len(xs), 1)], -1).reshape(-1, 3)
    ins = (base_local(P) < 0).reshape(len(y), len(xs)); last = len(xs) - 1 - np.argmax(ins[:, ::-1], 1); ok = ins.any(1)
    lo = xs[last]; hi = xs[np.minimum(last + 1, len(xs) - 1)]
    for _ in range(22):
        m = (lo + hi) / 2; inn = base_local(np.stack([m, y, z], -1)) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return np.where(ok, (lo + hi) / 2, 0.)
def ear_mid(U, V, side, thk):
    sp = lambda A: natspline(EAR_V, A)(V)
    yf = sp(EAR_YF); yb = sp(EAR_YB); y = yf + (yb - yf) * (U + 1) / 2; zc = sp(EAR_ZC)
    z = zc + sp(EAR_TILT) * (.4 - (U + 1) / 2) * 2 - .040 * U * smooth(.5, 1., V)
    xs_pt = skull_x(y, z).reshape(U.shape); xs_fr = skull_x(yf + .06, zc).reshape(U.shape)
    w = smooth(.04, .30, V); xs = np.maximum(xs_pt * (1 - w) + xs_fr * w, .90 * xs_fr)
    x = xs + thk / 2 + sp(EAR_OFF)
    x = np.maximum.accumulate(x, axis=0)                          # below the skull's widest point the ear hangs (no tuck under the jaw)
    x = x + sp(EAR_FAN) * ((U + 1) / 2) ** 1.3 + sp(EAR_BUL) * np.clip(1 - U * U, 0, 1) ** .6
    x = x - .040 * smooth(.88, 1., V) * np.clip(1 - U * U, 0, 1)   # the tip curls back toward the neck a little
    # round 3: below the brow, the section is laid out across the sheet's front-view lobe: the front edge at EAR_IN(z) (close to the
    # cheek, coming in under the jaw), the back edge out at EAR_OUT(z) (a slight flare), a soft outward bulge in between
    zz = z
    if EAR_HANG:
        # round 4: the lobe HANGS. Its front edge carries the front-view outline (EAR_XOUT, nearly vertical below z 0.5: the outer
        # edge leans ~6 deg), and the lobe faces EAR_FACE deg forward: the back edge tucks in behind the jaw, so the pink inner face
        # shows from the front and the near ear is seen almost edge-on (not as a wing) from the 45-deg game camera
        wl = smooth(EAR_W0, EAR_W1, zz)
        x_f = np.interp(zz, EAR_TZ2, EAR_XOUT) - thk / 2
        x_b = x_f - (yb - yf) * math.tan(math.radians(EAR_FACE))
        h = (U + 1) / 2
        xl = x_f + (x_b - x_f) * h + EAR_LBUL * np.clip(1 - U * U, 0, 1) ** .7 * smooth(.70, .40, zz) - EAR_CURL * smooth(.18, -.02, zz) * smooth(.35, 1., h)
    else:
        wl = smooth(.54, .30, zz)
        x_in = np.interp(zz, EAR_TZ, EAR_IN) + thk / 2; x_out = np.interp(zz, EAR_TZ, EAR_OUT) - thk / 2
        h = ((U + 1) / 2) ** .85
        xl = x_in + (x_out - x_in) * h + EAR_LBUL * np.clip(1 - U * U, 0, 1) ** .7 * smooth(.40, .10, zz)
    x = x * (1 - wl) + xl * wl
    return np.stack([side * x, y, z], -1)
ear_info = {}; EAR_GRID = {}
def head_field_L(q): return head_local(q, neck=False)
_SH = np.array([.160, -.010 + .002, .608 * LIFT]); _ad = unit(np.array([math.sin(math.radians(40.)), -.05, -math.cos(math.radians(40.))]))
def shoulder_sdf(p):
    """the +x sleeve as a tapered capsule (metres), from build's sleeve: shoulder SH, arm direction 40 deg, radii 0.075 -> 0.125 m"""
    return sd_capsule(p, _SH - _ad * .045, _SH + _ad * .235, (.080, .128))
for side, tag in ((1, 'L'), (-1, 'R')):
    nv, nu = 22, 15
    uu = np.linspace(-1, 1, nu)
    vend = 1 - .15 * (1 - np.sqrt(np.clip(1 - ((uu - .05) / 1.05) ** 2, 0, 1)))      # the rounded leaf tip, lowest a little behind the middle (round 3: fuller)
    v0 = .12 * smooth(-.35, -1., uu) ** 1.5                                          # round 3: the top-front corner rounds down into the front edge
    VV = v0[None, :] + np.linspace(0, 1, nv)[:, None] ** 1.05 * (vend - v0)[None, :]
    UU = np.broadcast_to(uu, (nv, nu)).copy()
    vrel_g = VV / np.maximum(vend[None, :], 1e-6)
    rimw = smooth(.55, .95, np.abs(UU)) + (1 - smooth(.55, .95, np.abs(UU))) * smooth(.80, .97, vrel_g)      # 1 on the rolled rim (the edges and the tip)
    thk = (.054 + .030 * rimw * (1 - .55 * smooth(-.6, -1., UU) * smooth(.40, .15, VV))) * (1 - .30 * smooth(.92, 1., vrel_g)) * (.45 + .55 * smooth(.0, .30, VV))     # round 3: rim 0.084 W (a 0.042 W roll), middle 0.054 W; the front rim thins into the root
    G = ear_mid(UU, VV, side, thk)
    tflat = thk.reshape(-1); vflat = VV.reshape(-1)
    Gf = push_out(G.reshape(-1, 3) * np.array([side, 1, 1.]), np.where(vflat > .18, tflat / 2 + .020, -1.), head_field_L)
    # round 3: the wider lobe hangs behind the shoulder: keep it clear of the sleeve top (the sleeve's own parameters, +x side, metres)
    _f = lambda q: shoulder_sdf(L2M(q)) / W; _cl = np.where(vflat > .30, tflat / 2 + .024, -1.)
    for _ in range(14):        # pushed back / up in the y-z plane only, so the front-view lobe width stays
        _d = _f(Gf); _need = np.maximum(_cl - _d, 0)
        if _need.max() < 1e-6: break
        _g = gradL(_f, Gf); _g[:, 0] = 0; _g = unit(_g); Gf = Gf + _g * (_need / np.maximum((_g * gradL(_f, Gf)).sum(1), .3))[:, None]
    G = (Gf * np.array([side, 1, 1.])).reshape(G.shape)
    dV = np.gradient(G, axis=0); dU = np.gradient(G, axis=1)
    NG = unit(np.cross(dV, dU) * side)
    cen = L2M(np.array([[0, .10, .40]]))[0]
    Gm = L2M(G.reshape(-1, 3)).reshape(G.shape)
    if (NG * unit(Gm - cen)).sum() < 0: NG = -NG
    Vm = Gm.reshape(-1, 3); Nm = NG.reshape(-1, 3); tm = (thk * W).reshape(-1)
    plain = np.zeros(len(Vm), bool); plain[:nu] = True                       # the root edge is buried in the skull
    Vt, Ft, UVt, Nt = thicken(Vm, grid_faces(nv, nu), Nm, tm, np.zeros((len(Vm), 2)), np.zeros((len(Vm), 2)), np.zeros((len(Vm), 2)), rim=4, plain=plain)
    nb = len(Vm)
    vparam = np.concatenate([VV.reshape(-1), VV.reshape(-1)]); uparam = np.concatenate([UU.reshape(-1), UU.reshape(-1)])
    extra = len(Vt) - 2 * nb
    if extra:
        kd = KDTree(nb)
        for i_, p_ in enumerate(Vm): kd.insert(p_, i_)
        kd.balance()
        src = np.array([kd.find(Vt[2 * nb + i])[1] for i in range(extra)])
        vparam = np.concatenate([vparam, VV.reshape(-1)[src]]); uparam = np.concatenate([uparam, UU.reshape(-1)[src]])
    # the root rows are pressed into the skull (hidden), easing out to lie on it
    wcov = np.maximum(smooth(.22, .0, vparam), smooth(-.45, -1., uparam) * smooth(.36, .10, vparam))      # round 3: the top-front corner wraps onto the skull too
    dsk = skull_sdf(Vt); excess = np.maximum(0, dsk + .012 * W) * wcov
    Vt = Vt - grad(skull_sdf, Vt) * excess[:, None]
    _vn = vnormals(Vt, Ft); _vn = np.where(((_vn * Nt).sum(1) < 0)[:, None], -_vn, _vn); Nt = unit(.80 * _vn + .20 * Nt)
    inward = unit(cen - Vt); facing_in = smooth(.10, .70, (Nt * inward).sum(1))
    vrel = vparam / np.maximum(np.interp(uparam, uu, vend), 1e-6)
    edge_ = 1 - np.sqrt(np.clip(1 - uparam ** 2, 0, 1)) * (1 - smooth(.80, 1., vrel))
    outer_ = (np.arange(len(Vt)) < nb).astype(float)
    roll_ = smooth(.80, .97, np.abs(uparam)) * outer_ - .06 / .08 * np.exp(-((np.abs(uparam) - .66) / .10) ** 2) * outer_ * (1 - smooth(.85, .95, vrel))
    shade = sval(Nt, hi=.18, lo=.12, occ=.12 * facing_in * smooth(.06, .26, vparam)) + .14 + .04 * smooth(.22, .0, vparam) + .08 * roll_ * smooth(.10, .30, vparam)      # round 3: the rolled rim catches light, a soft band inside it; no dark seam at the root
    pinkness = clamp((.70 * facing_in + .40 * smooth(-.50, -.95, uparam)) * smooth(.08, .25, vrel) * (1 - .55 * smooth(-.2, .6, uparam)) * smooth(1.0, .88, vrel) * .85)
    print('EAR_DBG', tag, round(float(facing_in.mean()), 3), round(float(shade.mean()), 3), round(float(pinkness.mean()), 3), round(float(((Nt[:nb] * unit(Vt[:nb] - cen)).sum(1) > 0).mean()), 3), flush=True)
    make_obj('ear.' + tag, Vt, Ft, mix_uv('earmix', shade, pinkness), 'ear.' + tag, N=Nt)
    EAR_GRID[tag] = (Gm.reshape(-1, 3), VV.reshape(-1).copy())
    ear_info[tag] = {'base': Gm[1, nu // 2].tolist(), 'fold': Gm[int(nv * .32), nu // 2].tolist(), 'tip': Gm[-1, nu // 2].tolist()}
    LOG['ear_%s_min_clear_of_head_W' % tag] = round(float((head_field_L(M2L(Vt[vparam > .2]))).min()), 4)

BODY_PAINTERS = {}; BODY_PIVOTS = {}; BODY_MEAS = {}; POST_JOIN = None
if not HEAD_ONLY:
    # ============================================================== BODY AND ROBE (metres; body axis x = 0; heights BZ(), widths BX())
    RCY = -.010
    def lathe_ring(ax, ay, cy, z, a, p=2.3):
        return np.stack([ax * spow(np.sin(a), 2 / p), cy - ay * spow(np.cos(a), 2 / p), z + 0 * a], -1)

    def sparkle(du, dv, size):
        """a soft 4-point star (metres from its centre): a thin horizontal and a thin vertical diamond, a round glow core"""
        ax_, ay_ = np.abs(du) / size, np.abs(dv) / size
        arm = np.maximum(1 - smooth(.75, 1., ax_ + 5.0 * ay_), 1 - smooth(.75, 1., ay_ + 5.0 * ax_))
        core = 1 - smooth(.10, .32, np.hypot(ax_, ay_))
        return clamp(np.maximum(arm, core))
    def sun_motif(du, dv, R, nray=10, phase=.31):
        """a painted sun (metres from its centre): a round disc and a ring of tapered rays, a gap between them"""
        r = np.hypot(du, dv); th = np.arctan2(dv, du); aa_ = .05 * R
        disc = 1 - smooth(.38 * R - aa_, .38 * R + aa_, r)
        k = ((th - phase) * nray / (2 * PI)) % 1.0; k = np.abs(k - .5) * 2            # 0 at a ray's centre line .. 1 between rays
        w = .50 * np.clip(1 - (r - .50 * R) / (.50 * R), 0, 1) ** .9                  # the ray's half width (of the spacing), tapering out
        ray = (1 - smooth(w - .06, w + .06, k)) * smooth(.47 * R, .53 * R, r) * (1 - smooth(.96 * R, 1.0 * R, r))
        return clamp(np.maximum(disc, ray))
    def sun_drop(dx, dy, rb, L):
        """a teardrop sun ray: its round end (radius rb) at the origin, tapering to a point L above it (dy up)"""
        d_round = np.hypot(dx, dy) - rb
        w = rb * np.clip(1 - dy / L, 0, 1) ** 1.25
        d_tail = np.where((dy > 0) & (dy < L), np.abs(dx) - w, 9.)
        d = np.minimum(d_round, d_tail); aa_ = .0018
        return 1 - smooth(-aa_, aa_, d)
    def sparkle_field(px, py, stars):
        """the sparkle cover at chart points (px, py in metres along / around the surface) for stars [(x, y, size)]"""
        out = np.zeros(np.shape(px))
        for x0, y0, sz in stars: out = np.maximum(out, sparkle(px - x0, py - y0, sz))
        return out
    def wrap_uvs(F, n_out, ncol, UVt, chart, uv_of):
        """per-face corner UVs: the first n_out faces (the outer sheet of a wrapped grid) use the position chart, seam-safe
        (a face's corners in column 0 take u = 1 when the face also touches the last column); the rest keep the vertex UVs"""
        out = []
        for fi, f in enumerate(F):
            if fi < n_out:
                cols = [v % ncol for v in f]; wrapf = (0 in cols) and (ncol - 1 in cols)
                out.append(tuple(tuple(au(chart, *uv_of(v, ncol if (wrapf and c == 0) else c))) for v, c in zip(f, cols)))
            else: out.append(tuple(tuple(UVt[v]) for v in f))
        return out
    NECK_TUBE = False     # round 2: the neck is part of the head field (it reaches under the collar), so the back junction is one smooth surface
    print('BODY_STEP neck', flush=True)
    # ---------------------------------------------------------------- the neck: a soft fur tube from inside the robe's neckline up into the head's neck base
    NK_Y = RCY + .012
    def neck_sdf(p):
        t = clamp((.790 - p[:, 2]) / .22); ax_ = .118 + .012 * t + .022 * smooth(.70, .79, p[:, 2]); ay_ = .108 + .012 * t + .020 * smooth(.70, .79, p[:, 2])
        r = np.sqrt((p[:, 0] / ax_) ** 2 + ((p[:, 1] - NK_Y) / ay_) ** 2); return (r - 1) * np.minimum(ax_, ay_)
    zn = np.linspace(.572 * LIFT, .790, 9)
    if NECK_TUBE: ring_stack('neck', neck_sdf, np.stack([np.zeros(9), np.full(9, NK_Y), zn], -1), np.tile([0, 0, 1.], (9, 1)), 'neck',
               lambda NN, V: fur_uv(sval(NN, hi=.18, lo=.20, occ=.10 + .10 * smooth(.66, .71, V[:, 2])), .0), sides=18, tmax=.20, ref=[0, -1., 0],
               pole_start=False, pole_end=False)
    print('BODY_STEP robe top', flush=True)
    # ---------------------------------------------------------------- the kimono top (chart 'robe'): neckline to the obi
    TZ = np.array([.440, .480, .530, .580, .615, .640, .660]) * LIFT
    TAX = np.array([.150, .150, .158, .172, .178, .160, .132])
    TAY = np.array([.128, .130, .138, .146, .144, .132, .118])
    tax_f = natspline(TZ, TAX); tay_f = natspline(TZ, TAY); TP = 2.3
    def torso_raw(a, z):
        a = np.asarray(a, float); z = np.asarray(z, float)
        return np.stack([tax_f(z) * spow(np.sin(a), 2 / TP), RCY - tay_f(z) * spow(np.cos(a), 2 / TP), z + 0 * a], -1)
    def torso_n(a, z, e=1e-4):
        da = torso_raw(np.asarray(a) + e, z) - torso_raw(np.asarray(a) - e, z)
        dz = torso_raw(a, np.asarray(z) + e) - torso_raw(a, np.asarray(z) - e)
        n = unit(np.cross(dz, da)); c = torso_raw(a, z) - np.stack([0 * np.asarray(a), RCY + 0 * np.asarray(a), np.asarray(z) * 0 + .55], -1)
        return np.where(((n * c).sum(-1) < 0)[..., None], -n, n)
    def torso_pt(a, z, off=0.):
        return torso_raw(a, z) + torso_n(a, z) * np.asarray(off, float)[..., None]
    def torso_a_of_x(x, z, front=True):
        s_ = np.clip(np.asarray(x, float) / tax_f(z), -.999, .999); a = np.arcsin(spow(s_, TP / 2))
        return a if front else PI - a
    NA_T, NZ_T = 32, 10
    zt_ = np.linspace(TZ[0], TZ[-1], NZ_T); at_ = np.linspace(0, 2 * PI, NA_T, endpoint=False)
    AA, ZZ = np.meshgrid(at_, zt_)
    Pt_ = torso_raw(AA, ZZ); Nt_ = torso_n(AA, ZZ)
    Pg = np.concatenate([Pt_, Pt_[:, :1]], 1); Ng = np.concatenate([Nt_, Nt_[:, :1]], 1)
    Ug = np.concatenate([(AA / (2 * PI)), np.ones((NZ_T, 1))], 1); Vg = np.repeat(((zt_ - TZ[0]) / (TZ[-1] - TZ[0]))[:, None], NA_T + 1, 1)
    make_obj('robe_top', Pg.reshape(-1, 3), grid_faces(NZ_T, NA_T + 1), au('robe', Ug.ravel(), Vg.ravel()), 'body', N=Ng.reshape(-1, 3))
    # the wrap collar: the V crossing at the chest (her left panel over her right), z of the crossing
    ZX = .556 * LIFT; ZN = .648 * LIFT
    def band_x(z, s):      # x of the collar band of side s (her left = +1) on the front, between the shoulder and the obi
        return s * (.098 - .166 * (ZN - z) / (ZN - .505 * LIFT))
    def paint_robe(U, V):
        a = U * 2 * PI; z = TZ[0] + V * (TZ[-1] - TZ[0])
        n = torso_n(a, z); sv = sval(n, hi=.26, lo=.20)
        x = tax_f(z) * spow(np.sin(a), 2 / TP); front = np.cos(a) > 0
        C = ramp_colour('peri', sv)
        # soft lighter lavender wash over the chest and the shoulders (the jellyfish shimmer) and fold shading under the arms
        wash = .30 * np.exp(-((x - .06) / .07) ** 2 - ((z - .60) / .05) ** 2) + .20 * np.exp(-((np.abs(x) - .15) / .04) ** 2) * smooth(.56, .63, z)
        C = mix(C, rgb('perilight'), .55 * clamp(wash))
        C = mix(C, rgb('peridark'), .30 * np.exp(-((np.abs(np.sin(a)) - 1) / .12) ** 2) * smooth(.60, .52, z))
        # inside the V (above the crossing): the pearl-pink under-collar, shaded deeper toward the crossing
        vin = front & (z > ZX) & (x < band_x(z, 1) - .010) & (x > band_x(z, -1) + .010)
        C = mix(C, ramp_colour('peri', sv - .10 - .08 * smooth(ZX + .05, ZX, z)), vin * 1.)
        # phase 3: two small suns on the back, between the shoulder blades and the shoulders (big and few: they read at 45 deg)
        for a0_, z0_, R_ in ((PI - .62, .612, .030), (PI + .62, .612, .030)):
            da = (((a - a0_) + PI) % (2 * PI) - PI) * .150; dz = z - z0_ * LIFT
            C = mix(C, rgb('motif'), .95 * sun_motif(da, dz, R_) * (1 - vin))
        return C
    BODY_PAINTERS['robe'] = paint_robe
    for s, tag in ((1, 'L'), (-1, 'R')):
        # the band: from behind the neck, over the shoulder, down the front across the chest to under the obi
        zs = np.linspace(ZN, .500, 9)
        front_pts = [torso_pt(np.array([torso_a_of_x(band_x(z_, s), z_)]), np.array([z_]), .010 + .003 * (s > 0))[0] for z_ in zs]
        back_pts = [torso_pt(np.array([s * a_]), np.array([.655 * LIFT]), .008)[0] for a_ in (PI * .92, PI * .70, PI * .50, PI * .30)]
        path = cpath(back_pts + front_pts[1:] if False else back_pts + front_pts, 22)
        nrm = torso_n(np.array([math.atan2(p_[0], -(p_[1] - RCY)) for p_ in path]), np.clip(path[:, 2], TZ[0], TZ[-1]))
        sweep('collar_band.' + tag, path, lambda k: (.0085, .021), 'body', ramp_sw('pink', hi=.26, add=.02 + .02 * (s > 0)), sides=8,
              normals=nrm, p=.75, cap0=False, cap1=True)

    print('BODY_STEP obi', flush=True)
    # ---------------------------------------------------------------- the pearl-pink obi, its front knot, the two hanging tails and the sea-glass beads
    OBI_Z0, OBI_Z1 = BZ(.4362), BZ(.5087); OBI_ZC = (OBI_Z0 + OBI_Z1) / 2; OBI_H = OBI_Z1 - OBI_Z0
    NAS = 32; a_s = np.linspace(0, 2 * PI, NAS, endpoint=False)
    Pb = torso_pt(a_s, np.full(NAS, OBI_ZC), .012); Nb = torso_n(a_s, np.full(NAS, OBI_ZC)); Nb[:, 2] = 0; Nb = unit(Nb)
    ab8 = np.linspace(0, 2 * PI, 8, endpoint=False)
    ring_tube('obi', Pb, lambda k: np.stack([.014 * spow(np.cos(ab8), .45), OBI_H / 2 * spow(np.sin(ab8), .40)], -1), 'body',
              lambda NN, tt, uu, V: ramp_uv('pink', sval(NN, hi=.26, lo=.20)), Nb, sides=8)
    OBI_FRONT_Y = float(torso_pt(np.array([0.]), np.array([OBI_ZC]), .012 + .014)[0, 1])
    KNOT = np.array([.030, OBI_FRONT_Y - .012, OBI_ZC + .004])
    lobe('obi_knot', KNOT, np.array([.026, .040, .036]), [0, -1., 0], 'body', ramp='pink', n=3, occ_in=.06, squash=.05, pole=[0, 0, 1.])
    # the skirt's front surface, for the tails to hang over (filled below, once the skirt is built)
    BEAD_PTS = []

    print('BODY_STEP skirts', flush=True)
    # ---------------------------------------------------------------- three bell skirts with scalloped hems: periwinkle over pearl pink over a sheer pink
    def bell_geom(prm, a, t):
        """a point on a bell skirt (angle a, height fraction t), the scallop bulge included"""
        z_top, top_ax, top_ay, hem_ax, hem_ay_f, hem_ay_b, z_notch, z_lobe, nlobe, phase, bulge, flare, cy = prm
        f = (a / (2 * PI) * nlobe + phase) % 1.0; lob = np.sqrt(np.clip(1 - (2 * f - 1) ** 2, 0, 1))
        z_hem = z_notch - (z_notch - z_lobe) * lob ** .8; z = z_top + (z_hem - z_top) * t; g = t ** flare
        bl = bulge * lob * smooth(.55, 1., t)
        ax_ = top_ax + (hem_ax - top_ax) * g + bl
        ay_ = np.where(np.cos(a) > 0, top_ay + (hem_ay_f - top_ay) * g, top_ay + (hem_ay_b - top_ay) * g) + bl
        return np.stack([ax_ * spow(np.sin(a), 2 / 2.2), cy - ay_ * spow(np.cos(a), 2 / 2.2), z + 0 * a], -1), lob
    def bell_skirt(name, group, z_top, top_ax, top_ay, hem_ax, hem_ay_f, hem_ay_b, z_notch, z_lobe, nlobe, na, nz, thick, chart, tone_fn,
                   phase=0., bulge=.012, flare=.85, cy=RCY, pchart=None, stars=()):
        prm = (z_top, top_ax, top_ay, hem_ax, hem_ay_f, hem_ay_b, z_notch, z_lobe, nlobe, phase, bulge, flare, cy)
        a = np.linspace(0, 2 * PI, na, endpoint=False)
        rows = []; tv = []
        for j in range(nz):
            t = j / (nz - 1); P_, lob = bell_geom(prm, a, np.full(na, t)); rows.append(P_); tv.append(np.full(na, t))
        G = np.array(rows); TV = np.array(tv)
        dK = np.gradient(G, axis=0); dS = np.roll(G, -1, 1) - np.roll(G, 1, 1)
        NG = unit(np.cross(dS, dK)); ctr = np.stack([0 * G[..., 0], cy + 0 * G[..., 0], G[..., 2]], -1)
        NG = np.where(((NG * (G - ctr)).sum(-1) < 0)[..., None], -NG, NG)
        V = G.reshape(-1, 3); NN = NG.reshape(-1, 3); TT = TV.reshape(-1); LB = np.tile(lob, nz); AN = np.tile(a, nz)
        F = grid_faces(nz, na, wrap=True)
        plain = np.zeros(len(V), bool); plain[:na] = True
        sh_o = sval(NN, hi=.26, lo=.20); sh_i = sval(-NN, hi=.10, lo=.10) - .16
        tone = tone_fn(TT, LB, AN)
        UVo = mix_uv(chart, sh_o, tone); UVi = mix_uv(chart, sh_i, tone * .5)
        Vt, Ft, UVt, Nt = thicken(V, F, NN, thick, UVo, UVi, UVo, rim=4, plain=plain)
        n = len(V); extra = len(Vt) - 2 * n
        if extra:   # the rim: shade from its own normals, the tone of the hem
            UVt = np.array(UVt, float); UVt[2 * n:] = mix_uv(chart, sval(Nt[2 * n:], hi=.26, lo=.20), np.full(extra, float(tone_fn(np.ones(1), np.ones(1), np.zeros(1))[0])))
        if pchart:  # round 2: the outer sheet painted from its position (soft shading, tone, the faint star sparkles)
            UVt = wrap_uvs(Ft, len(F), na, np.asarray(UVt), pchart, lambda v, c: (c / na, (v // na) / (nz - 1)))
            def paint_bell(U, V_, prm=prm, tone_fn=tone_fn, stars=stars):
                sh = U.shape; aa = (U * 2 * PI).ravel(); tt = V_.ravel(); e = 1e-3
                P0, lb = bell_geom(prm, aa, tt); Pa, _ = bell_geom(prm, aa + e, tt); Pt, _ = bell_geom(prm, aa, np.minimum(tt + e, 1.))
                Nn = unit(np.cross(Pa - P0, Pt - P0)); ctr_ = np.stack([0 * aa, prm[-1] + 0 * aa, P0[:, 2]], -1)
                Nn = np.where(((Nn * (P0 - ctr_)).sum(-1) < 0)[:, None], -Nn, Nn)
                C = paint_perimix(sval(Nn, hi=.26, lo=.20), tone_fn(tt, lb, aa))
                if stars:     # phase 3: (the outer skirt) a teardrop sun ray on each scallop
                    nl_ = prm[8]; fl_ = (aa / (2 * PI) * nl_ + prm[9]) % 1.0
                    rad_ = np.hypot(P0[:, 0], P0[:, 1] - prm[-1])
                    dx_ = (fl_ - .5) * (2 * PI / nl_) * rad_
                    Hh = prm[0] - prm[7]; dy_ = (DROP_T - tt) * Hh
                    C = mix(C, rgb('motif'), .93 * sun_drop(dx_, dy_, DROP_RB, DROP_L))
                return C.reshape(sh + (3,))
            BODY_PAINTERS[pchart] = paint_bell
        make_obj(name, Vt, Ft, UVt, group, N=Nt)
        return dict(z_top=z_top, top=(top_ax, top_ay), hem=(hem_ax, hem_ay_f, hem_ay_b), z_hem=(z_lobe, z_notch), flare=flare, cy=cy)
    def skirt_pt(S, a, t):
        """a point on a skirt's outer surface (no scallop bulge), its angle a and the height fraction t"""
        g = t ** S['flare']; ax_ = S['top'][0] + (S['hem'][0] - S['top'][0]) * g
        ay_ = S['top'][1] + ((S['hem'][1] if math.cos(a) > 0 else S['hem'][2]) - S['top'][1]) * g
        z = S['z_top'] + (S['z_hem'][1] - S['z_top']) * t
        return np.array([ax_ * spow(np.sin(a), 2 / 2.2), S['cy'] - ay_ * spow(np.cos(a), 2 / 2.2), z])
    # round 2: the periwinkle robe ends 62 % of the way from the obi to the feet (sheet); the pink layer is tall (its scallops reach
    # 36 % of the obi-to-ground height below the periwinkle notches), with 11 big round lobes; the sheer layer just below, clear of the feet
    FEET_TOP = .060; Z_PERI = OBI_Z0 - .62 * (OBI_Z0 - FEET_TOP)
    DROP_T, DROP_RB, DROP_L = .80, .021, .105              # phase 3: the skirt's teardrop sun rays (height fraction, round-end radius, length)
    STARS = [(.30 * a_, t_ * (OBI_Z0 + .020 - (Z_PERI + .040)), sz) for a_, t_, sz in
             ((.35, .55, .020), (-.55, .40, .016), (1.05, .62, .018), (-1.20, .70, .015), (2.35, .45, .017), (-2.6, .58, .016), (.80, .25, .013), (-.15, .78, .014))]
    STARS = STARS + [(x_ + 2 * PI * .30, y_, z_) for x_, y_, z_ in STARS if x_ < 0]
    # round 3: a jellyfish bell. The hem widths are set against the skirt's width just below the sleeve cuffs (the sheet's visible
    # waist, the obi's ends being hidden by the cuffs): periwinkle 1.45x, pink 1.55x (sheet: measure/flare.py). The flare exponent
    # (> 1) keeps the skirt close under the sleeves and opens it toward the hem.
    BELL_PERI = (.338, .292, .270); BELL_PINK = (.360, .325, .300); FLARE_PERI = 1.55
    SK_PERI = bell_skirt('skirt_periwinkle', 'skirt_outer', OBI_Z0 + .020, .150, .128, BELL_PERI[0], BELL_PERI[1], BELL_PERI[2],
                         Z_PERI + .040, Z_PERI, 12, 72, 9, .022, 'perimix',
                         lambda t, lb, an: clamp(.10 + .30 * lb * smooth(.55, 1., t) + .18 * np.exp(-((np.sin(an * 3 + 1.0)) / .5) ** 2) * smooth(.2, .7, t)),
                         phase=.5, pchart='skirt', stars=STARS, flare=FLARE_PERI)
    SK_PINK = bell_skirt('skirt_pink', 'skirt_mid', Z_PERI + .100, .225, .196, BELL_PINK[0], BELL_PINK[1], BELL_PINK[2],
                         .152, .090, 11, 77, 8, .022, 'pinkmix',
                         lambda t, lb, an: clamp(.05 + .55 * smooth(.45, 1., t) * (.55 + .45 * lb)), phase=0., bulge=.018, flare=.90)
    SK_SHEER = bell_skirt('skirt_sheer', 'skirt_inner', Z_PERI + .040, .240, .214, BX(.2400), .290, .250,
                          .094, .084, 16, 40, 4, .012, 'pinkmix',
                          lambda t, lb, an: clamp(.55 + .40 * t), phase=.25, bulge=.006, flare=1.)
    # the obi tails hang from the knot over the periwinkle skirt and past its hem (thick rounded ribbons, separate bend rings)
    def skirt_pt_z(S, a, z, off):
        """a point `off` in front of a skirt's outer surface at angle a and height z (below the hem: straight down from it)"""
        t = np.clip((S['z_top'] - z) / (S['z_top'] - S['z_hem'][1]), 0, 1)
        P_ = skirt_pt(S, a, float(t)); n_ = unit(np.array([P_[0], P_[1] - S['cy'], 0.])); P_[2] = z
        return P_ + n_ * off
    for k, (a_end, z_end, wid) in enumerate(((-.40, BZ(.3128), .025), (.10, BZ(.1796), .028))):
        n_ = 10; pts_ = []
        a0_ = math.atan2(KNOT[0], -(KNOT[1] - RCY))
        for j in range(n_):
            u = j / (n_ - 1)
            if u < .15: P_ = KNOT + np.array([0, -.006, -.026 * u / .15])
            else:
                uu_ = (u - .15) / .85; z_ = (KNOT[2] - .030) + (z_end - (KNOT[2] - .030)) * uu_
                P_ = skirt_pt_z(SK_PERI, a0_ + (a_end - a0_) * uu_ ** .8, z_, .016 + .010 * smooth(.7, 1., uu_))
            pts_.append(P_)
        pts_ = np.array(pts_)
        for _ in range(2): pts_[1:-1] = .25 * pts_[:-2] + .5 * pts_[1:-1] + .25 * pts_[2:]
        nrm_ = unit(np.stack([pts_[:, 0] * .8, pts_[:, 1] - RCY, np.zeros(n_) - .10], -1))
        sweep('obi_tail.%d' % k, pts_, lambda j, wid=wid: (.0085, wid * (1 + .12 * j / 9)), 'obi_tails', ramp_sw('pink', hi=.26, add=.02), sides=10,
              normals=nrm_, p=.70)
    # the sea-glass beads on the knot (the brief: two; the 3/4 view: stacked)
    for k, (dx, dz, d_) in enumerate(((.006, .010, .064), (.030, -.062, .068), (.064, .004, .056))[:BEADS if BEADS == 3 else 2]):
        c_ = KNOT + np.array([dx, -.034 - d_ * .30, dz])
        def bead_uv(NV, V, DL, c_=c_, r_=d_ / 2):
            hi_ = smooth(.2, .9, NV @ unit(np.array([-.3, -.6, .75])))
            return mix_uv('glassmix', sval(NV, hi=.30, lo=.22), clamp(.10 + .80 * hi_ ** 2))
        lobe('seaglass_bead.%d' % k, c_, np.array([d_ / 2] * 3), [0, -1., 0], 'body', n=3, squash=0, uvfn=bead_uv)
        BEAD_PTS.append(c_.tolist())

    print('BODY_STEP back bow', flush=True)
    # ---------------------------------------------------------------- the big pearl-pink bow at the back (separate piece: loops, knot, tails)
    BOW_Y = float(torso_pt(np.array([PI]), np.array([OBI_ZC]), .012 + .014)[0, 1])
    BOW_C = np.array([0, BOW_Y + .022, OBI_ZC + .004])
    BW, BH = BX(.2362) / 2, BZ(.0966) / 2
    for sg in (-1, 1):
        lc = BOW_C + np.array([sg * BW * .60, .014, .004])
        def loop_sdf(p, lc=lc, sg=sg):
            q = p - lc; xr = q[:, 0] * sg                                 # 0 at the loop centre, + outward
            taper = .55 + .45 * smooth(-BW * .55, BW * .25, xr)           # pinched toward the knot
            d = ell(np.stack([q[:, 0], q[:, 1], q[:, 2] / taper], -1), [0, 0, 0], [BW * .62, .040, BH * 1.30])
            dim = np.exp(-((xr + BW * .05) / (BW * .22)) ** 2 - (q[:, 2] / (BH * .35)) ** 2) * smooth(-.01, .03, q[:, 1])
            return d + .010 * dim                                          # the soft dimple of the loop's opening
        def loop_uv(NN, V, lc=lc, sg=sg):
            xr = (V[:, 0] - lc[0]) * sg
            return ramp_uv('pink', sval(NN, hi=.26, lo=.20, occ=.18 * smooth(-.02, -.10, xr)) + .03)
        star_mesh('bow_loop.%d' % sg, loop_sdf, lc, 'bow', loop_uv, nth=11, nph=20, tmax=.24, axis=(sg, 0, 0), ref=(0, 1., 0))
    lobe('bow_knot', BOW_C + np.array([0, .030, 0]), np.array([.026, .034, .042]), [0, 1., 0], 'bow', ramp='pink', n=3, occ_in=.05, squash=.05, pole=[0, 0, 1.])
    BOW_TAIL_Z = BZ(.2832)
    for sg in (-1, 1):
        n_ = 8; pts_ = []
        for j in range(n_):
            u = j / (n_ - 1); z_ = BOW_C[2] - .02 - (BOW_C[2] - .02 - BOW_TAIL_Z) * u
            P_ = np.array([sg * (.010 + .065 * u ** 1.1), 0, z_])
            # follow the periwinkle skirt's back surface
            tt_ = np.clip((SK_PERI['z_top'] - z_) / (SK_PERI['z_top'] - SK_PERI['z_hem'][1]), 0, 1)
            ay_back = SK_PERI['top'][1] + (SK_PERI['hem'][2] - SK_PERI['top'][1]) * tt_ ** SK_PERI['flare']
            P_[1] = max(RCY + ay_back + .020, BOW_C[1] + .015 if u < .2 else -1)
            pts_.append(P_)
        pts_ = np.array(pts_)
        sweep('bow_tail.%d' % sg, pts_, lambda j: (.0090, .033 + .005 * j / 7), 'bow', ramp_sw('pink', hi=.26, add=.01), sides=10,
              normals=np.tile([0, 1., 0], (n_, 1)), p=.70)

    print('BODY_STEP necklace', flush=True)
    # ---------------------------------------------------------------- the pearl necklace: 13 chunky pearls round the collar, the big one at the front
    NP_ = 18
    for k in range(NP_):
        a_ = 2 * PI * k / NP_; fr_ = math.cos(a_)
        big = k == 0; nb_ = k in (1, NP_ - 1)
        d_ = .080 if big else (.060 if nb_ else .052)
        z_ = (.662 - .036 * max(0, fr_) ** 1.8 - .004 * (1 - abs(fr_))) * LIFT
        c_ = torso_pt(np.array([a_]), np.array([min(z_, TZ[-1])]), d_ / 2 * .92)[0]
        if z_ > TZ[-1] - .004: c_ = c_ + unit(np.array([c_[0], c_[1] - RCY, 0.])) * .010
        def pearl_uv(NV, V, DL):
            hi_ = smooth(.30, .95, NV @ unit(np.array([-.3, -.55, .78])))
            return ramp_uv('pearl', sval(NV, hi=.22, lo=.22) + .12 * hi_ ** 3)
        _o = unit(np.array([c_[0], c_[1] - RCY, 0.]))
        for _ in range(30):
            if fr_ > .30 or head_sdf(c_[None])[0] > d_ / 2 * .75: break       # the front pearls may touch the jaw (sheet)
            c_ = c_ + _o * .002
        lobe('pearl.%d' % k, c_, np.array([d_ / 2] * 3), [0, -1., 0], 'body', n=3 if fr_ > -.80 else 2, squash=0, uvfn=pearl_uv)

    print('BODY_STEP sleeves and arms', flush=True)
    # ---------------------------------------------------------------- wide bell sleeves (periwinkle shells, a rolled pink cuff), fur arms, mitten paws
    ARM = {}; ARM_DEG = 40.
    for s, tag in ((1, 'L'), (-1, 'R')):
        th = math.radians(ARM_DEG); ad = unit(np.array([s * math.sin(th), -.05, -math.cos(th)]))
        SH = np.array([s * .160, RCY + .002, .608 * LIFT])
        fwd = unit(np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])))
        dn = unit(np.cross(ad, fwd) * -s); dn = dn if dn[2] < 0 else -dn        # perpendicular to the arm, pointing down
        def along(t0, SH=SH, ad=ad): return SH + ad * t0
        L_SL = .232
        ts = np.linspace(-.04, L_SL, 9); rings = []; nrms = []
        sa = np.linspace(0, 2 * PI, 22, endpoint=False)
        for t0 in ts:
            u = (t0 + .04) / (L_SL + .04)
            ra = .070 + .040 * u ** 1.9; rb = .072 + .050 * u ** 1.7               # across (front-back) and hanging (down) radii: a real bell (1.5x)
            hang = .028 * u ** 1.5
            C0 = along(t0) + dn * hang
            rings.append(C0 + (np.cos(sa)[:, None] * fwd * ra + np.sin(sa)[:, None] * dn * rb))
            nrms.append(unit(np.cos(sa)[:, None] * fwd / ra + np.sin(sa)[:, None] * dn / rb))
        G = np.array(rings); NG = np.array(nrms)
        V = G.reshape(-1, 3); NN = NG.reshape(-1, 3); nr_, ns_ = G.shape[:2]
        tone = np.repeat(np.linspace(.05, .30, nr_), ns_) + .15 * np.tile(np.clip(-np.sin(sa), 0, 1), nr_)
        UVo = mix_uv('perimix', sval(NN, hi=.26, lo=.20), tone); UVi = mix_uv('perimix', sval(-NN, hi=.10, lo=.10) - .18, .05)
        plain = np.zeros(len(V), bool); plain[:ns_] = True
        Fs_ = grid_faces(nr_, ns_, wrap=True)
        Vt, Ft, UVt, Nt = thicken(V, Fs_, NN, .016, UVo, UVi, UVo, rim=3, plain=plain)
        # round 2: the outer sheet painted from its position (chart 'sleeve.L/R'): soft shading, the tone, a few faint star sparkles
        UVt = wrap_uvs(Ft, len(Fs_), ns_, np.asarray(UVt), 'sleeve.' + tag, lambda v, c: (c / ns_, (v // ns_) / (nr_ - 1)))
        def sleeve_geom(u, ang, SH=SH, ad=ad, fwd=fwd, dn=dn, L_SL=L_SL):
            t0 = -.04 + u * (L_SL + .04); ra = .070 + .040 * u ** 1.9; rb = .072 + .050 * u ** 1.7; hang = .028 * u ** 1.5
            return SH + ad * t0[:, None] + dn * hang[:, None] + np.cos(ang)[:, None] * fwd * ra[:, None] + np.sin(ang)[:, None] * dn * rb[:, None]
        sstars = [(a_, u_, sz) for a_, u_, sz in ((-.9 * s, .62, .016), (-.3 * s, .80, .013), (.6 * s, .45, .012), (2.4 * s, .70, .014), (1.6, .35, .011))]
        def paint_sleeve(U, V_, sleeve_geom=sleeve_geom, sstars=sstars, s=s):
            sh = U.shape; ang = (U * 2 * PI).ravel(); u = V_.ravel(); e = 1e-3
            P0 = sleeve_geom(u, ang); Pa = sleeve_geom(u, ang + e); Pu = sleeve_geom(np.minimum(u + e, 1.), ang)
            ax_c = sleeve_geom(u, ang * 0) * .5 + sleeve_geom(u, ang * 0 + PI) * .5
            Nn = unit(np.cross(Pa - P0, Pu - P0)); Nn = np.where(((Nn * (P0 - ax_c)).sum(-1) < 0)[:, None], -Nn, Nn)
            C = paint_perimix(sval(Nn, hi=.26, lo=.20), clamp(.05 + .25 * u + .15 * np.clip(-np.sin(ang), 0, 1)))
            sun = np.zeros(len(u))
            for a_, u_, R_ in ((-.15, .57, .056), (PI + .15, .57, .050)):      # phase 3: front and back (big: they read at 45 deg)
                da = (((ang - a_) + PI) % (2 * PI) - PI) * .092; du = (u - u_) * (L_SL + .04)
                sun = np.maximum(sun, sun_motif(da, du, R_))
            return mix(C, rgb('motif'), .95 * sun).reshape(sh + (3,))
        BODY_PAINTERS['sleeve.' + tag] = paint_sleeve
        make_obj('sleeve.' + tag, Vt, Ft, UVt, 'sleeve.' + tag, N=Nt)
        # the rolled pink cuff round the opening
        cu = rings[-1]; cn_ = nrms[-1]
        ap6 = np.linspace(0, 2 * PI, 7, endpoint=False)
        ring_tube('sleeve_cuff.' + tag, cu + cn_ * .002, lambda k: np.stack([.013 * np.cos(ap6), .020 * np.sin(ap6)], -1), 'sleeve.' + tag,
                  lambda NN, tt, uu, V: mix_uv('pinkmix', sval(NN, hi=.26, lo=.20) + .02, .15), cn_, sides=7)
        # the fur arm from inside the sleeve, a fur wrist and the mitten paw
        EL = along(.150); WR = along(.255); PC = along(.305)
        def arm_sdf(p, SH=SH, WR=WR, ad=ad): return sd_capsule(p, SH + ad * .06, WR, (.050, .044))
        tsa = np.linspace(.07, .262, 8)
        ring_stack('fur_arm.' + tag, arm_sdf, SH[None] + ad[None] * tsa[:, None], np.tile(ad, (len(tsa), 1)), 'arm.' + tag,
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20), .05), sides=12, tmax=.14, ref=fwd, pole_start=False, pole_end=False)
        lat = unit(np.cross(ad, fwd)) * s
        paw_axes = np.array([ad, fwd, lat])
        fingers = [PC + ad * .046 + fwd * (o * .026) - lat * .004 for o in (-1, 0, 1)]
        thumb = PC + fwd * .050 - lat * .016 - ad * .006
        def paw_parts(p, WR=WR, PC=PC, paw_axes=paw_axes, fingers=fingers, thumb=thumb, ad=ad):
            d_w = sd_capsule(p, WR - ad * .03, PC, (.046, .056))
            d_paw = sd_ell(p, PC, paw_axes, (.062, .066, .056))
            d_f = [sd_ell(p, f, paw_axes, (.029, .025, .031)) for f in fingers]
            d_t = sd_ell(p, thumb, paw_axes, (.027, .024, .024))
            return d_w, d_paw, d_f, d_t
        def paw_sdf(p, paw_parts=paw_parts):
            d_w, d_paw, d_f, d_t = paw_parts(p)
            d = smin(d_w, d_paw, .026); ff = smin(smin(d_f[0], d_f[1], .006), d_f[2], .006)
            return smin(smin(d, ff, .014), d_t, .010)
        def paw_uv(NN, V, paw_parts=paw_parts):
            d_w, d_paw, d_f, d_t = paw_parts(V)
            cr = crease(d_f[0], d_f[1], .006) * .25 + crease(d_f[1], d_f[2], .006) * .25 + crease(np.minimum(d_paw, d_w), d_t, .010) * .2
            return fur_uv(sval(NN, occ=1.2 * cr, hi=.20, lo=.20), .12)
        tt_ = np.linspace(0, .14, 281); inside = paw_sdf(PC[None] + ad[None] * tt_[:, None]) < 0
        reach = float(tt_[np.argmin(inside)]) if not inside.all() else .14
        tips = PC + ad * (reach - .007)
        tsp = np.concatenate([np.linspace(0, .45, 4)[:-1], np.linspace(.45, 1.0, 10)])
        cen = (WR - ad * .03)[None] + (tips - (WR - ad * .03))[None] * tsp[:, None]
        ring_stack('mitten_paw.' + tag, paw_sdf, cen, np.tile(ad, (len(tsp), 1)), 'arm.' + tag, paw_uv, sides=12, tmax=.14, ref=fwd)
        ARM[tag] = {'shoulder': SH.tolist(), 'elbow': EL.tolist(), 'wrist': WR.tolist(), 'palm': (PC - lat * .010).tolist(),
                    'grip_axis': fwd.tolist(), 'arm_dir': ad.tolist()}

    print('BODY_STEP legs feet', flush=True)
    # ---------------------------------------------------------------- short fur legs and big soft feet (three toe lobes)
    LEG = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        HP = np.array([s * .112, RCY, .330 * LIFT]); AN = np.array([s * BX(.1101), RCY - .006, .085])
        def leg_sdf(p, HP=HP, AN=AN): return sd_capsule(p, HP, AN, (.066, .058))
        zs = np.linspace(.325 * LIFT, .075, 9)
        cen = np.array([HP + (AN - HP) * ((z_ - HP[2]) / (AN[2] - HP[2])) for z_ in zs])
        ring_stack('fur_leg.' + tag, leg_sdf, cen, np.tile(unit(AN - HP), (len(zs), 1)), 'body',
                   lambda NN, V: fur_uv(sval(NN, hi=.20, lo=.20, occ=.10 * smooth(.20, .30, V[:, 2])), .0), sides=12, tmax=.20, ref=[0, -1., 0],
                   pole_start=False)
        FC = np.array([s * BX(.122), -.040, .046]); FAX = rot([0, 0, 1], s * math.radians(8)).T
        toes = [FC + (np.array([o * .036, -.100, -.004]) @ FAX) for o in (-1, 0, 1)]
        def foot_parts(p, FC=FC, FAX=FAX, toes=toes, AN=AN):
            d_main = sd_ell(p, FC + np.array([0, .012, 0]), FAX, (.084, .122, .056))
            d_ank = sd_capsule(p, AN + np.array([0, 0, .015]), AN + np.array([0, -.010, -.030]), .062)
            d_t = [sd_ell(p, t, FAX, (.032, .040, .040)) for t in toes]
            return d_main, d_ank, d_t
        def foot_sdf(p, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(p)
            d = smin(d_main, d_ank, .028); tt = smin(smin(d_t[0], d_t[1], .007), d_t[2], .007)
            d = smin(d, tt, .018)
            return smax(d, -(p[:, 2] - .002), .010)
        def foot_uv(NN, V, foot_parts=foot_parts):
            d_main, d_ank, d_t = foot_parts(V)
            cr = crease(d_t[0], d_t[1], .007) * .30 + crease(d_t[1], d_t[2], .007) * .30
            return fur_uv(sval(NN, occ=1.1 * cr + .10 * smooth(.02, .0, V[:, 2]), hi=.20, lo=.20), .10)
        star_mesh('fur_foot.' + tag, foot_sdf, FC + np.array([0, -.010, .022]), 'body', foot_uv, nth=10, nph=18, tmax=.26)
        LEG[tag] = {'hip': HP.tolist(), 'knee': (HP + (AN - HP) * .55).tolist(), 'ankle': AN.tolist(), 'toe': (FC + np.array([0, -.130, -.010]) @ FAX).tolist()}
    # the hips / bloomers under the skirts (hidden from the game camera; closes the view up the skirt)
    star_mesh('hips', lambda p: ell(p, [0, RCY, .345 * LIFT], [.190, .160, .110]), np.array([0, RCY, .345 * LIFT]), 'body', ramp_fn('pink', hi=.10, add=-.12), nth=7, nph=14, tmax=.30)

    print('BODY_STEP tail', flush=True)
    # ---------------------------------------------------------------- the long thin waggy tail: a tapered tube from under the skirt, curving up and back
    TAIL_P = np.array([[0, .150, .372], [-.006, .262, .318], [-.030, .372, .300], [-.068, .456, .330], [-.104, .505, .392], [-.124, .520, .458]]) * np.array([1, 1, LIFT])
    tpath = cpath(TAIL_P, 16)
    def tail_r(k): t = k / (len(tpath) - 1); r = .029 - .010 * t; return (r, r * .96)
    sweep('tail', tpath, tail_r, 'tail', lambda NV, tt, uu, V: fur_uv(sval(NV, hi=.22, lo=.20), .10 * tt), sides=10, up_hint=[0, 0, 1.])
    TAIL_PATH = tpath

    # ---------------------------------------------------------------- measurements of the authored parts (metres; fractions of the crown height)
    def _vs(prefixes):
        out = []
        for g, obs in parts.items():
            for o in obs:
                if any(o.name.startswith(p) for p in prefixes): out += [list(o.matrix_world @ v.co) for v in o.data.vertices]
        return np.array(out)
    def _ext(v): return {'min': [round(float(c), 3) for c in v.min(0)], 'max': [round(float(c), 3) for c in v.max(0)], 'size': [round(float(c), 3) for c in np.ptp(v, 0)]}
    BODY_MEAS = {'body_parts_m': {k: _ext(_vs(v)) for k, v in {
        'robe_top': ['robe_top'], 'collar': ['collar_band'], 'obi': ['obi'], 'obi_tails': ['obi_tail'], 'beads': ['seaglass_bead'], 'pearls': ['pearl'],
        'skirt_periwinkle': ['skirt_periwinkle'], 'skirt_pink': ['skirt_pink'], 'skirt_sheer': ['skirt_sheer'], 'bow': ['bow_'],
        'sleeve_L': ['sleeve.L', 'sleeve_cuff.L'], 'paw_L': ['mitten_paw.L'], 'legs': ['fur_leg'], 'feet': ['fur_foot'], 'tail': ['tail']}.items()}}
    BODY_MEAS['arm_angle_from_vertical_deg'] = ARM_DEG
    BODY_PIVOTS = {'neck': (0, NK_Y, .600 * LIFT), 'arm.L': tuple(ARM['L']['shoulder']), 'arm.R': tuple(ARM['R']['shoulder']), 'sleeve.L': tuple(ARM['L']['shoulder']), 'sleeve.R': tuple(ARM['R']['shoulder']),
                   'tail': tuple(TAIL_PATH[0]), 'body': (0, 0, 0), 'bow': tuple(BOW_C), 'obi_tails': tuple(KNOT),
                   'skirt_outer': (0, RCY, OBI_Z0), 'skirt_mid': (0, RCY, OBI_Z0), 'skirt_inner': (0, RCY, OBI_Z0)}
    def POST_JOIN():
        joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X'}
        joints.update({'hips': [0, RCY, round(.380 * LIFT, 4)], 'spine': [0, RCY, round(.470 * LIFT, 4)], 'chest': [0, RCY - .004, round(.560 * LIFT, 4)], 'neck': [0, RCY - .004, round(.650 * LIFT, 4)]})
        joints['head'] = [float(v) for v in O]
        joints['jaw_pivot'] = [0, float(HY - .05 * W), float(CHIN + .20 * W)]
        joints['eyes'] = {'R': eye_centers['R'], 'L': eye_centers['L']}
        joints['ears'] = {t: {'base': [float(v) for v in ear_info[t]['base']], 'fold': [float(v) for v in ear_info[t]['fold']],
                              'tip': [float(v) for v in ear_info[t]['tip']]} for t in ('R', 'L')}
        joints['arms'] = {t: {k: ARM[t][k] for k in ('shoulder', 'elbow', 'wrist')} for t in ARM}
        joints['legs'] = LEG
        joints['tail'] = [TAIL_PATH[i].tolist() for i in (0, 3, 6, 9, 12, len(TAIL_PATH) - 1)]
        joints['palm_R'] = ARM['R']['palm']; joints['palm_L'] = ARM['L']['palm']
        joints['mouth'] = MOUTH_INFO
        joints['bow'] = {'knot': BOW_C.tolist()}; joints['obi_knot'] = KNOT.tolist(); joints['beads'] = BEAD_PTS
        joints['notes'] = ['Phase 1: no rig, weights or animations. Same keys as chewy-b joints-round13.json, plus palm_R / palm_L, mouth, bow, obi_knot.',
                           'head = the head centre (the radial origin), not the nod pivot: the rig should put the head bone at the base of the skull.',
                           'Head skin = zero surface of one smooth implicit ball (skull + cheeks + muzzle + chin + nose), analytic normals, adaptive toon-band refinement.',
                           'Mouth: a sculpted lip-parting groove (closed smile) with 5 loops round it; the skin is cut along the parting (see mouth).',
                           'Eyelid holes ringed by 6 loops each with the rim rolled 4.5 mm in behind separate lens eyeballs; 5 loops round the nose.',
                           'Ears: separate pieces (Stella_ear_L / _R), 22 bend rows from the root (pressed into the skull) to the tip; pivot = ears.base.',
                           'Tail: Stella_tail, a 16-ring tapered tube, pivot = tail[0]. Sleeves (Stella_sleeve_L/_R) are separate shells with 9 bend rings; '
                           'the skirt layers (Stella_skirt_outer / _mid / _inner) are separate lathed shells (9 / 6 / 4 rings); the back bow (Stella_bow) and the obi tails (Stella_obi_tails) are separate.',
                           'Arms: fur ring stacks (arm.L/R) from inside the sleeves to the mitten paws; legs: 9-ring stacks, feet star meshes.']
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
def lash_th(psi):      # the thick upper lash line: thickest over the top-outer part, tapering into both corners
    top = (.10 * np.sin(np.clip(psi, 0, PI)) ** .7 + .07 * np.exp(-((psi - .45) / .40) ** 2)) * smooth(-.25, .18, psi) * smooth(PI + .05, PI - .50, psi)
    return .040 + 1.35 * top
def paint_hit(d):
    """the head surface along each paint direction: bisection, then the outermost root where bisection found an inner one"""
    P = radial_hit(d); t = np.linalg.norm(P - O, axis=1)
    bad = np.zeros(len(d), bool)
    for k in range(1, 9):
        tk = np.minimum(t + .012 * k, .52); bad |= head_sdf(O + d * tk[:, None]) < 0
    if bad.any(): P[bad] = radial_hit_outer(d[bad])
    return P
def paint_head(U, V, P=None):
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P = paint_hit(d) if P is None else P; n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); qx, qz = q[:, 0], q[:, 2]; ax_ = np.abs(qx)
    fr = smooth(HY + .04, HY - .08, y)
    C = ramp_colour('fur', sval(n, hi=.12, lo=.20))
    # the lighter muzzle (round the nose, the lips and the chin) and soft lighter brow ridges and cheek tops
    rm = np.minimum(np.sqrt((((q - np.array(MUZ[0])) / (np.array(MUZ[1]) * 1.06)) ** 2).sum(1)),
                    np.sqrt((((q - np.array(JAW[0])) / (np.array(JAW[1]) * 1.08)) ** 2).sum(1)))
    qm_ = mirror(q); rb = np.sqrt((((qm_ - np.array(BROW[0]) - np.array([0, -.02, .015])) / (np.array(BROW[1]) * np.array([1.05, 1.6, 1.15]))) ** 2).sum(1))
    rc = np.sqrt(((ax_ - .30) / .17) ** 2 + ((qz - .315) / .085) ** 2) + 9 * (y > HY - .20 * W)
    Lm = np.maximum.reduce([1 - smooth(.86, 1.06, rm), .80 * (1 - smooth(.55, 1.05, rb)), .45 * (1 - smooth(.5, 1.0, rc))]) * fr
    C = mix(C, ramp_colour('lfur', sval(n, hi=.18, lo=.18)), Lm)
    # soft clay creases where the muzzle and chin meet the cheeks (fillet shading, never lines)
    qw = warped(q); dsk = smin(skull(qw), ell(mirror(qw), *JOWL), K_JOWL)
    cr = .45 * crease(dsk, muz_sdf(qw), K_MUZ) + .35 * crease(smin(dsk, muz_sdf(qw), K_MUZ), ell(qw, *JAW), K_JAW)
    C = mix(C, rgb('furdark'), clamp(cr) * .30 * fr)
    C = mix(C, rgb('furdark'), .30 * smooth(.04, -.06, qz) * smooth(-.15, -.7, n[:, 2]))      # the under-jaw shade
    # blush: soft pink dabs on the outer cheeks under the eyes
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .62 * (1 - smooth(.10, 1.05, r)) * fr * PAINT_OPTS['blush'])
    # brows: soft darker arcs above the eyes, just under the brow ridge highlight
    t_ = np.linspace(0, 1, 9)
    for s in (-1, 1):
        Pb = np.stack([s * (.150 + .215 * t_), .775 + .028 * np.sin(PI * t_ ** .85) - .030 * t_], -1)
        hb = .0085 + .0095 * np.sin(PI * t_) ** .7
        near = (np.abs(qx - s * .26) < .17) & (qz > .68) & (qz < .86)
        a = np.zeros(len(x)); a[near] = stroke(qx[near], qz[near], Pb, hb, .006)
        C = mix(C, rgb('brow'), .80 * a * fr)
    # nose button: soft pinkish grey, a soft top highlight and two small nostrils
    qq = q - NOSE_C; qq[:, 1] = qq[:, 1] - nose_recede(qq[:, 2]); widen = nose_widen(qq[:, 2]); qq[:, 2] = qq[:, 2] * nose_flat(qq[:, 2])
    rn = np.sqrt((qq[:, 0] / (NHW * widen)) ** 2 + (qq[:, 1] / NHD) ** 2 + (qq[:, 2] / NHH) ** 2)
    # round 2: the painted button follows the sheet's front outline (a rounded triangle, 0.233 W wide at the top, z 0.17-0.335 W),
    # projected from the front onto the nose and the muzzle round it, limited in depth so it doesn't run back over the bridge
    zr_ = (qz - NZW) / NHH; hw_ = NOSE_PW * (.62 + .38 * smooth(-1.0, .55, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
    r2d = np.sqrt((qx / np.maximum(hw_, 1e-4)) ** 2 + ((zr_ - .03) / 1.03) ** 2)
    deep = (q[:, 1] - NOSE_TIP_L)
    nose_m = (1 - smooth(.94, 1.02, r2d)) * smooth(.16, .11, deep) * (n[:, 1] < .2)
    nose_c = ramp_colour('nose', sval(n, hi=.10, lo=.22) - .05)
    C = mix(C, nose_c, .98 * np.maximum(nose_m, 1 - smooth(1.05, 1.12, rn)))
    rh_ = np.sqrt(((qq[:, 0] + .018) / .040) ** 2 + ((qq[:, 2] - .030) / .022) ** 2) + 9 * (qq[:, 1] > .030)
    C = mix(C, rgb('nosehi'), .60 * (1 - smooth(.40, 1.0, rh_)) * np.maximum(rn < 1.10, nose_m > .5))
    for sx in (-1, 1):
        dx_ = qx - sx * .044; dz_ = qz - (NZW - .018); ca_, sa_ = math.cos(sx * .5), math.sin(sx * .5)
        rno = np.sqrt(((dx_ * ca_ + dz_ * sa_) / .020) ** 2 + ((-dx_ * sa_ + dz_ * ca_) / .010) ** 2) + 9 * (qq[:, 1] > -.008)
        C = mix(C, rgb('nostril'), .80 * (1 - smooth(.70, 1.10, rno)))
    # the sculpted mouth: no painted line; only a soft darker shade on the groove walls, by depth behind the un-grooved surface
    mb = (fr > 0) & mouth_mask(q)
    if mb.any():
        dep = -head_local_pre(q[mb])
        C[mb] = mix(C[mb], mix(rgb('#7E7276'), rgb('groove'), smooth(.0055, .0120, dep)), .95 * smooth(.0030, .0085, dep))
    # the eyes: pink eyeshadow over the lid, the thick upper lash line with a small wing, a thin soft lower rim
    for s in (-1, 1):
        sr, psi, X, Z = eye_s3(s, P)
        near_eye = fr * (sr < 2.0)
        sh_ = (1 - smooth(1.10, 1.52, sr)) * smooth(-.05, .45, np.sin(psi)) * smooth(-.15, .25, Z)
        C = mix(C, rgb('shadow'), .85 * sh_ * near_eye)
        th = lash_th(psi)
        lash = (1 - smooth(1 + th - .015, 1 + th + .015, sr))
        low = (1 - smooth(1.022, 1.050, sr)) * smooth(.15, -.35, np.sin(psi))
        # the wing: a short tapered flick off the outer top corner, curling up (two little lashes)
        wing = np.zeros(len(x))
        for k_, (a0, a1, lw) in enumerate(((.24, .58, .085), (.52, .82, .062))):
            tt_ = np.linspace(0, 1, 7)
            Pw = np.stack([(1.00 + .06 * k_ + .30 * tt_) * math.cos(a0) + .05 * tt_, (1.00 + .02 * k_ + .10 * tt_) * math.sin(a0) + .24 * tt_ ** 1.4 + .02 * k_], -1)
            hw_ = lw * (1 - .85 * tt_)
            nw = near_eye > 0
            wv = np.zeros(len(x)); wv[nw] = stroke(X[nw], Z[nw], Pw, hw_, .012)
            wing = np.maximum(wing, wv)
        C = mix(C, rgb('lash'), np.maximum(np.maximum(lash, wing * PAINT_OPTS['lash']) * PAINT_OPTS['lash'], .55 * low) * near_eye)
    return C.reshape(sh + (3,))

AA_COUNT = [0]
def paint_head_aa(U, V):
    """round 2: the head chart, with 4x4 supersampling where the thin painted lines live (the mouth groove shade, the nose edge and the
    nostrils), so their edges don't staircase at the chart's 0.8 px / mm"""
    sh = U.shape; d = head_uv_dir(U.ravel(), V.ravel()); P0 = paint_hit(d); q = M2L(P0); C = paint_head(U, V, P0)
    front = (np.abs(q[:, 0]) < .34) & (q[:, 2] > .02) & (q[:, 2] < .40) & (q[:, 1] < -.30)
    near = np.zeros(len(q), bool)
    if front.any():
        qf = q[front]; _ma2 = mouth_arch(np.linspace(-1.05, 1.05, 90), True)
        dm = np.min(np.hypot(qf[:, 0:1] - _ma2[None, :, 0], qf[:, 2:3] - _ma2[None, :, 1]), axis=1)
        dph = np.where((qf[:, 2] < NZW) & (qf[:, 2] > MA_C - .01), np.abs(qf[:, 0]), 9.)
        zr_ = (qf[:, 2] - NZW) / NHH
        hw_ = NOSE_PW * (.62 + .38 * smooth(-1.0, .55, zr_)) * np.sqrt(np.clip(1 - np.clip(zr_ - .55, 0, 1) ** 2 / .45 ** 2 * .35, 0, 1))
        r2d = np.sqrt((qf[:, 0] / np.maximum(hw_, 1e-4)) ** 2 + ((zr_ - .03) / 1.03) ** 2)
        near[np.where(front)[0]] = (dm < .030) | (dph < .015) | ((r2d > .80) & (r2d < 1.20)) | ((r2d < .9) & (zr_ < .3))
    if near.any():
        x0, y0, w, h = CHARTS['head']; du = 1. / (w - 12); dv = 1. / (h - 12)
        Uf = U.ravel()[near]; Vf = V.ravel()[near]; acc = np.zeros((len(Uf), 3))
        for a in (-1 / 3, 0., 1 / 3):
            for b in (-1 / 3, 0., 1 / 3):
                acc += paint_head(Uf + a * du, Vf + b * dv)
        Cf = C.reshape(-1, 3); Cf[near] = acc / 9; C = Cf.reshape(sh + (3,))
    AA_COUNT[0] += int(near.sum())
    return C

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .17; iz = -.02; irx = .82; irz = .92          # iris 82 % of the opening, tucked toward the nose (sheet close-up)
    C = mix(rgb('sclera'), rgb('#E6DCD6'), .55 * smooth(.40, .98, Z))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    g = smooth(.70, -.90, ez)                                   # 0 at the top .. 1 at the bottom of the iris
    I = mix(rgb('#45699E'), rgb('iris'), smooth(.15, .65, g))
    I = mix(I, rgb('irisglow'), .78 * smooth(.55, 1.0, g) * (1 - smooth(.72, .94, r)))     # the soft lighter lower glow
    I = mix(I, rgb('irisrim'), .92 * smooth(.76, .97, r))                                  # the darker outer ring
    I = I * (1 - .04 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)) * smooth(.35, .75, r))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    pz = iz + .05 * irz; R = np.sqrt(((X - ix) / (.50 * irx)) ** 2 + ((Z - pz) / (.53 * irz)) ** 2)
    C = mix(C, mix(rgb('pupil'), rgb('#2C3654'), .55 * smooth(.2, -1., (Z - pz) / (.53 * irz))), 1 - smooth(.95, 1.05, R))
    # two catchlights high on the nose side (as on the sheet): a big round one and a smaller one beside it
    hx = ix - s * .26 * irx; hz = pz + .40 * irz
    big = np.sqrt(((X - hx) / (.20 * irx)) ** 2 + ((Z - hz) / (.18 * irz)) ** 2)
    small = np.sqrt(((X - (ix + s * .22 * irx)) / (.10 * irx)) ** 2 + ((Z - (pz + .44 * irz)) / (.09 * irz)) ** 2)
    C = mix(C, rgb('#FFFBF4'), np.maximum(1 - smooth(.92, 1.08, big), .85 * (1 - smooth(.88, 1.10, small))))
    C = mix(C, rgb('lash'), smooth(.92, 1.0, sr) * smooth(-.10, .40, Z))
    C = mix(C, rgb('#5A4E58'), .50 * smooth(.95, 1.02, sr) * smooth(.0, -.40, Z))
    skin = ramp_colour('fur', .45)
    return mix(C, skin, smooth(1.03, 1.07, sr))

def paint_ramp(U, V):
    rows = np.clip((V * CHARTS['ramp'][3] / 32).astype(int), 0, 15); C = np.zeros(U.shape + (3,))
    for name, k in RAMP_ROWS.items():
        m = rows == k
        if not m.any(): continue
        C[m] = ramp_colour(name, U[m])
    return C
def paint_furmix(U, V): return mix(ramp_colour('fur', U), ramp_colour('lfur', U), V)
def paint_earmix(U, V):            # v: 0 = the silver fur .. 1 = the faint pink inner side
    return mix(ramp_colour('fur', U), ramp_colour('innerear', U), V)
def paint_perimix(U, V):           # v: 0 = periwinkle .. 1 = the light lavender-blue highlight of the jellyfish robe
    return mix(ramp_colour('peri', U), mix(ramp_colour('peri', U + .18), rgb('#F3C757'), .45), V)     # phase 3: saffron .. a warm lighter saffron (never pale)
def paint_pinkmix(U, V):           # v: 0 = pearl pink .. 1 = the translucent pale hem edge
    return mix(ramp_colour('petti', U), mix(ramp_colour('petti', U + .12), rgb('#FFF6E6'), .40), V)  # phase 3: the warm white petticoats and cuffs
def paint_glassmix(U, V):          # sea glass: v 0 = deep .. 1 = the bright inner glow
    return mix(ramp_colour('glass', U), mix(rgb('glasslight'), rgb('#F4D58C'), .4), V)               # phase 3: amber, a warm soft highlight
PAINTERS = {'head': paint_head_aa, 'eye.L': lambda U, V: paint_eye(U, V, 1), 'eye.R': lambda U, V: paint_eye(U, V, -1),
            'ramp': paint_ramp, 'furmix': paint_furmix, 'earmix': paint_earmix, 'perimix': paint_perimix, 'pinkmix': paint_pinkmix,
            'glassmix': paint_glassmix}
PAINTERS.update(BODY_PAINTERS)
if RIG:    # phase 2: the mouth cavity (dark rose-brown) and the tongue, in unused atlas space (the approved atlas is untouched)
    PAINTERS['cavity'] = lambda U, V: mix(rgb('#4a1c24'), rgb('#341218'), .55 * smooth(.25, 1., V))
    PAINTERS['tongue'] = lambda U, V: mix(rgb('#e07a86'), rgb('#ee9aa6'), .45 * smooth(.15, .9, V))
atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [169, 166, 162, 255]
MIX_CHARTS = ('furmix', 'earmix', 'perimix', 'pinkmix', 'glassmix')
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
    for r0 in range(0, h, 64):
        block[r0:r0 + 64] = PAINTERS[name](U[r0:r0 + 64], V[r0:r0 + 64])
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
def write_png(path, arr):
    h_, w_ = arr.shape[:2]; raw = b''.join(b'\x00' + r.tobytes() for r in arr[::-1])
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
atlas_path = os.path.join(ROOT, 'scratch', 'head_atlas.png') if HEAD_ONLY else (os.path.join(ROOT, 'scratch', 'rig_base_atlas.png') if RIG else os.path.join(ROOT, 'stella-toy_atlas.png'))
write_png(atlas_path, atlas)
del atlas
img = bpy.data.images.load(atlas_path); img.name = 'Stella_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Stella_toy_atlas'); MAT.use_nodes = True
bs = MAT.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
nose_tip_y = HY + NOSE_TIP_L * W
rimL = np.array([verts[i] for i in roll_info[1][0]])
HR = head_report()
MEAS = {'units': 'W = %.3f m head width; z = above the chin in W; profile b = behind the nose tip in W' % W,
        'chin_z_m': CHIN, 'crown_m': LOG['crown_m'], 'skull_height_W': round((LOG['crown_m'] - CHIN) / W, 3),
        'heads_crown_to_chin': round(LOG['crown_m'] / (LOG['crown_m'] - CHIN), 3),
        'face_width_rows_W(z: width)': HR['widths(z: model)'], 'profile(z, model b, sheet b)': HR['profile(z, model b, sheet b)'],
        'nose_tip_y_m': round(float(nose_tip_y), 4),
        'eye_opening_W(front projection)': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'eye_centre_W': [EXW, EZW], 'iris_bottom_W': round(EZW + (-.02 - .92) * EHHW, 3),
        'nose_centre_z_W': NZW, 'nose_top_z_W': round(NZW + NHH, 3), 'nose_width_W(top)': round(2 * NHW * (1 + NOSE_WIDEN), 3), 'nose_height_W': round(2 * NHH, 3),
        'mouth_corner_W': [MA_X, round(float(mouth_arch(np.array([1.]), True)[0, 1]), 3)], 'mouth_centre_z_W': MA_C,
        'mouth': {k: v for k, v in MOUTH_INFO.items() if k not in ('parting_upper_m', 'parting_lower_m')}}
for tag in ('L', 'R'):
    if 'ear.' + tag in parts:
        ev = all_verts(parts['ear.' + tag]); q_ = M2L(ev)
        MEAS['ear_' + tag] = {'x_outer_W': round(float(np.abs(q_[:, 0]).max()), 3), 'z_min_W': round(float(q_[:, 2].min()), 3),
                              'y_range_W': [round(float(q_[:, 1].min()), 3), round(float(q_[:, 1].max()), 3)],
                              'z_of_widest_W': round(float(q_[np.argmax(np.abs(q_[:, 0])), 2]), 3), 'z_min_m': round(float(ev[:, 2].min()), 3)}
MEAS.update(LOG)
MEAS.update(BODY_MEAS)

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
PIVOTS = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
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
    if group.startswith('prop_'): continue
    ob = finish_group(obs, OBJ_NAMES.get(group, 'Stella_' + group.replace('.', '_')), PIVOTS.get(group, (0, 0, 0)), MAT)
    ob['phase'] = '1: neutral A-pose, no armature'
    part_tri[ob.name] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
from mathutils.bvhtree import BVHTree
def _bvh(ob):
    mw = ob.matrix_world; return BVHTree.FromPolygons([mw @ v.co for v in ob.data.vertices], [tuple(p.vertices) for p in ob.data.polygons])
_obs = {o.name: o for o in objects}
for _e in ('Stella_ear_L', 'Stella_ear_R'):
    if _e not in _obs: continue
    _be = _bvh(_obs[_e]); _hits = {}
    for _n, _o in _obs.items():
        if _n.startswith('Stella_ear') or _n.startswith('Stella_eye') or _n == 'Stella_head': continue
        _hits[_n] = len(_be.overlap(_bvh(_o)))
    LOG['ear_overlaps_' + _e[-1]] = {k_: v_ for k_, v_ in _hits.items() if v_}
    print('EAR_OVERLAP', _e, json.dumps(LOG['ear_overlaps_' + _e[-1]]), flush=True)
HEADSET = sum(v for k, v in part_tri.items() if k in ('Stella_head', 'Stella_eye_L', 'Stella_eye_R', 'Stella_ear_L', 'Stella_ear_R'))
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count; MEAS['head_eyes_ears_triangles'] = HEADSET
if RIG:
    pass
elif not HEAD_ONLY:
    if not os.environ.get('STELLA_NO_BUDGET'): assert tri_count <= 30000, ('Triangle budget', tri_count)
    if POST_JOIN: POST_JOIN()
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
else:
    with open(os.path.join(ROOT, 'scratch', 'measurements-head.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
if not RIG: print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not HEAD_ONLY and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'stella-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG:
    bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
print('STELLA_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)


# ============================================================== THE SUN WAGASA (phase 3; a separate GLB: a 512 prop atlas, a glow material)
# A Japanese oil-paper parasol, the sheet-sun.png callout: a peaked sunburst canopy (saffron rays on sunset-red panels, gold
# ribs, a pale underside), a gold sun-disc finial (its own *_glow material), 8 chunky amber tassels (each its own mesh,
# tassel_0..7, its origin where it hangs), a red lacquer shaft with a crook. Blender +Z along the shaft (the game's +Y), the
# origin at the grip (the same place on the shaft as the jellyfish parasol's, so the rig's mounts still fit).
if not HEAD_ONLY and not RIG:
    print('STEP wagasa', flush=True)
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
    parts.clear()
    PCH = {'pramp': (0, 0, 512, 256), 'canopy': (0, 256, 512, 256)}
    PRAMPS = ['red', 'gold', 'amber', 'cream', 'redwrap']
    RAMPS.update({'red': ('#B7432F', '#D9573E', '#E36D4E'), 'gold': ('#BF8A2C', '#E8B44A', '#F1C866'),
                  'amber': ('#B47823', '#DFA23C', '#EDBD60'), 'cream': ('#E2D0B0', '#F6EAD3', '#FBF2E2'),
                  'redwrap': ('#8C3323', '#A8432F', '#C0573F')})
    def pramp_uv(name, val):
        x, y, w, h = PCH['pramp']; val = clamp(np.asarray(val, float)); k = PRAMPS.index(name)
        return np.stack([(x + 8 + val * (w - 16)) / 512, np.full(val.shape, (y + k * 32 + 16) / 512)], -1)
    def pau(chart, u, v):
        x, y, w, h = PCH[chart]; g = 4
        return np.stack([(x + g + np.asarray(u) * (w - 2 * g)) / 512, (y + g + np.asarray(v) * (h - 2 * g)) / 512], -1)
    def p_sw(name, hi=.28, add=0.):
        return lambda NV, tt, uu, V: pramp_uv(name, sval(NV, hi=hi) + add)
    def p_lobe_uv(name, hi=.26, add=0.):
        return lambda NV, V_, DL: pramp_uv(name, sval(NV, hi=hi) + add)
    W_R, W_APEX, W_DROP, NRIB = .375, .600, .170, 16          # the canopy: radius at the rib tips (0.75 m across), the apex, its drop to the rim
    NA_W = NRIB * 3
    def canopy_pt(rh, ph):
        """the canopy's outer surface: a shallow peaked cone, the paper sagging a little between the ribs"""
        fr = (np.asarray(ph) / (2 * PI) * NRIB) % 1.0; bt = np.sin(PI * fr)                     # 0 on a rib .. 1 mid-panel
        R_ = W_R * rh * (1 - .028 * bt * rh ** 2)
        z_ = W_APEX - W_DROP * rh * (.86 + .14 * rh) - .011 * bt * rh ** 1.5
        return np.stack([R_ * np.cos(ph), R_ * np.sin(ph), z_ + 0 * ph], -1)
    phw = np.linspace(0, 2 * PI, NA_W, endpoint=False)
    rhw = np.array([.07, .17, .30, .44, .58, .72, .86, 1.0])
    G = np.array([canopy_pt(np.full(NA_W, r_), phw) for r_ in rhw])
    UVg = np.array([np.stack([phw / (2 * PI), np.full(NA_W, r_)], -1) for r_ in rhw])
    apex = np.array([0, 0, W_APEX + .002])
    V = np.concatenate([[apex], G.reshape(-1, 3)]); UVc = np.concatenate([[[.5, 0.]], UVg.reshape(-1, 2)])
    F = [(0, 1 + (i + 1) % NA_W, 1 + i) for i in range(NA_W)] + grid_faces(len(rhw), NA_W, wrap=True, off=1)   # (one winding throughout)
    NN = vnormals(V, F)
    if NN[:, 2].mean() < 0: NN = -NN                   # the outer sheet (the sunburst) faces up
    UVo = pau('canopy', UVc[:, 0], UVc[:, 1] * .5); UVi = pau('canopy', UVc[:, 0], .5 + UVc[:, 1] * .5)
    Vt, Ft, UVt, Nt = thicken(V, F, NN, .012, UVo, UVi, UVo, rim=3)
    UVt = np.asarray(UVt, float); UVf = []                 # per-face corner UVs: the faces across the u seam take u + 1 chart width
    for f in Ft:
        us = [UVt[v][0] for v in f]; wrap_ = max(us) - min(us) > .5
        UVf.append(tuple((UVt[v][0] + (504 / 512 if wrap_ and UVt[v][0] < .5 else 0), UVt[v][1]) for v in f))
    make_obj('canopy', Vt, Ft, UVf, 'prop_main', N=Nt)
    def paint_canopy(U, Vv):
        outer = Vv < .5; rh = np.where(outer, Vv * 2, (Vv - .5) * 2); fr = (U * NRIB) % 1.0; k_ = np.floor(U * NRIB).astype(int) % NRIB
        d_rib = np.minimum(fr, 1 - fr)                                                         # 0 on a rib .. 0.5 mid-panel
        # the outer side: the sunburst. Sunset-red paper; a saffron ray down the middle of every panel, broad and narrow in turn,
        # widening outward to a rounded end short of the rim; a saffron ring round the hub; the gold bamboo ribs; a gold rim band
        broad = (k_ % 2 == 0)
        wmax = np.where(broad, .34, .20)
        w = wmax * smooth(.20, .62, rh) ** .7 * np.sqrt(np.clip(1 - ((rh - .62) / .32) ** 2 * (rh > .62), 0, 1))
        ray = (1 - smooth(w - .025, w + .025, .5 - d_rib)) * smooth(.19, .23, rh)
        C_o = mix(ramp_colour('red', .48 - .10 * smooth(.6, 1., rh)), ramp_colour('peri', .50 + .04 * smooth(.3, .8, rh)), ray)
        hub = (1 - smooth(.15, .18, rh)) * smooth(.05, .08, rh)
        C_o = mix(C_o, ramp_colour('peri', .46), hub)
        rib = np.exp(-(d_rib / .030) ** 2) * smooth(.17, .22, rh)
        C_o = mix(C_o, rgb('#E8B44A'), .92 * rib)
        C_o = mix(C_o, ramp_colour('gold', .48), smooth(.955, .975, rh))
        # the underside: pale paper, the ribs radiating to a gold hub, a little darker toward the rim
        C_i = mix(ramp_colour('cream', .58), ramp_colour('cream', .40), smooth(.3, 1., rh))
        C_i = mix(C_i, rgb('#D6A243'), .85 * np.exp(-(d_rib / .022) ** 2) * smooth(.08, .12, rh))
        C_i = mix(C_i, ramp_colour('gold', .45), 1 - smooth(.08, .11, rh))
        return np.where(outer[..., None], C_o, C_i)
    # ---- the gold rim band and a gold bead at every rib tip
    rimP = canopy_pt(np.full(NA_W, 1.), phw) + np.array([0, 0, -.004]); rimN = unit(np.stack([np.cos(phw), np.sin(phw), -.35 + 0 * phw], -1))
    ap5 = np.linspace(0, 2 * PI, 5, endpoint=False)
    ring_tube('canopy_rim', rimP, lambda k: np.stack([.008 * np.cos(ap5), .009 * np.sin(ap5)], -1), 'prop_main',
              lambda NN_, tt, uu, V_: pramp_uv('gold', sval(NN_, hi=.30) + .02), rimN, sides=5)
    TIPS = []
    for j in range(NRIB):
        a_ = 2 * PI * j / NRIB; tip = canopy_pt(np.array([1.0]), np.array([a_]))[0] + np.array([.010 * math.cos(a_), .010 * math.sin(a_), -.006])
        lobe('rib_tip.%d' % j, tip, np.array([.013, .013, .013]), [math.cos(a_), math.sin(a_), 0], 'prop_main', n=2, squash=0, uvfn=p_lobe_uv('gold', add=.04))
        TIPS.append(tip)
    # ---- the hub on top, the shaft, the wrapped grip with two gold rings, the crook
    lobe('top_hub', np.array([0, 0, W_APEX + .006]), np.array([.024, .024, .014]), [0, 0, 1.], 'prop_main', n=2, squash=0, uvfn=p_lobe_uv('gold'))
    sweep('shaft', np.array([[0, 0, z_] for z_ in np.linspace(-.100, W_APEX - .004, 8)]), lambda k: (.016, .016), 'prop_main', p_sw('red', add=.02),
          sides=10, cap0=False, cap1=False, normals=np.tile([1., 0, 0], (8, 1)))
    sweep('grip', np.array([[0, 0, z_] for z_ in np.linspace(-.075, .075, 5)]), lambda k: (.021, .021), 'prop_main', p_sw('redwrap', hi=.24),
          sides=12, cap0=True, cap1=True, normals=np.tile([1., 0, 0], (5, 1)), p=.9)
    a10 = np.linspace(0, 2 * PI, 10, endpoint=False); ap4 = np.linspace(0, 2 * PI, 4, endpoint=False)
    for zr in (-.080, .080):
        ring_tube('grip_ring.%d' % (zr > 0), np.stack([.022 * np.cos(a10), .022 * np.sin(a10), np.full(10, zr)], -1),
                  lambda k: np.stack([.0045 * np.cos(ap4), .0045 * np.sin(ap4)], -1), 'prop_main',
                  lambda NN_, tt, uu, V_: pramp_uv('gold', sval(NN_, hi=.30) + .04), np.stack([np.cos(a10), np.sin(a10), 0 * a10], -1), sides=4)
    hk = [np.array([0, 0, -.100]), np.array([0, 0, -.150])]
    for t_ in np.linspace(0, 1, 9)[1:]:
        a_ = PI * t_; hk.append(np.array([.046 - .046 * math.cos(a_), 0, -.150 - .046 * math.sin(a_)]))
    hk.append(np.array([.094, 0, -.128]))
    hkp = cpath(hk, 14)
    sweep('hook', hkp, lambda k: (.016, .016), 'prop_main', p_sw('red', add=.02), sides=10, cap0=False, cap1=True, normals=np.tile([0, 1., 0], (14, 1)))
    # ---- the gold sun-disc finial (its own glow material): a flat twelve-rayed disc lying on the hub, a raised round face
    DISC_Z = W_APEX + .030; DISC_H = .018
    nst = 24; ast = np.linspace(0, 2 * PI, nst, endpoint=False); rst = np.where(np.arange(nst) % 2 == 0, .066, .052)
    zb_, zt_ = DISC_Z - DISC_H / 2, DISC_Z + DISC_H / 2
    def ring(r_, z_, shrink=1.): return np.stack([r_ * shrink * np.cos(ast), r_ * shrink * np.sin(ast), np.full(nst, z_)], -1)
    radial = np.stack([np.cos(ast), np.sin(ast), 0 * ast], -1)
    Vd = [ring(rst, zb_), ring(rst, zt_), ring(rst, zt_, .996), ring(rst, zb_, .996), [[0, 0, zt_]], [[0, 0, zb_]]]
    Nd = [radial, radial, np.tile([0, 0, 1.], (nst, 1)), np.tile([0, 0, -1.], (nst, 1)), [[0, 0, 1.]], [[0, 0, -1.]]]
    sb, st, ctp, cbt = 0, nst, 2 * nst, 3 * nst; c_t, c_b = 4 * nst, 4 * nst + 1
    Fd = [(sb + i, sb + (i + 1) % nst, st + (i + 1) % nst, st + i) for i in range(nst)]
    Fd += [(c_t, ctp + i, ctp + (i + 1) % nst) for i in range(nst)] + [(c_b, cbt + (i + 1) % nst, cbt + i) for i in range(nst)]
    a16 = np.linspace(0, 2 * PI, 16, endpoint=False); zf1 = zt_ + .007; rad16 = np.stack([np.cos(a16), np.sin(a16), 0 * a16], -1)
    o_ = 4 * nst + 2
    Vd += [np.stack([.036 * np.cos(a16), .036 * np.sin(a16), np.full(16, zt_ - .001)], -1), np.stack([.032 * np.cos(a16), .032 * np.sin(a16), np.full(16, zf1)], -1),
           np.stack([.0318 * np.cos(a16), .0318 * np.sin(a16), np.full(16, zf1)], -1), [[0, 0, zf1]]]
    Nd += [unit(rad16 + np.array([0, 0, .5])), unit(rad16 + np.array([0, 0, .5])), np.tile([0, 0, 1.], (16, 1)), [[0, 0, 1.]]]
    Fd += [(o_ + i, o_ + (i + 1) % 16, o_ + 16 + (i + 1) % 16, o_ + 16 + i) for i in range(16)]
    Fd += [(o_ + 48, o_ + 32 + i, o_ + 32 + (i + 1) % 16) for i in range(16)]
    Vd = np.concatenate([np.asarray(v_, float) for v_ in Vd]); Nd = np.concatenate([np.asarray(n_, float) for n_ in Nd])
    make_obj('sun_disc', Vd, Fd, np.tile([[.5, .5]], (len(Vd), 1)), 'prop_glow', N=Nd)
    FINIAL = np.array([0, 0, DISC_Z])
    # ---- 8 chunky amber tassels from every other rib tip: a round knob, a gold band, a thick flared fringe with a rounded end
    TASSELS = []
    for k in range(8):
        tip = TIPS[2 * k]; H_ = tip + np.array([0, 0, -.012]); g = 'prop_tassel_%d' % k
        L_ = (.105, .095, .112, .100, .108, .096, .110, .099)[k]
        lobe('tassel_knob.%d' % k, H_ + np.array([0, 0, -.016]), np.array([.016, .016, .015]), [0, 0, -1.], g, n=2, squash=0, uvfn=p_lobe_uv('amber', add=.04))
        a8 = np.linspace(0, 2 * PI, 8, endpoint=False)
        ring_tube('tassel_band.%d' % k, H_ + np.stack([.015 * np.cos(a8), .015 * np.sin(a8), np.full(8, -.034)], -1),
                  lambda q: np.stack([.0045 * np.cos(ap4), .0045 * np.sin(ap4)], -1), g,
                  lambda NN_, tt, uu, V_: pramp_uv('gold', sval(NN_, hi=.30)), np.stack([np.cos(a8), np.sin(a8), 0 * a8], -1), sides=4)
        zz = np.linspace(-.036, -L_, 6)
        body = np.array([H_ + np.array([0, 0, z_]) for z_ in zz])
        sweep('tassel_body.%d' % k, body, lambda q, L_=L_: ((.012 + .016 * (q / 5) ** 1.3),) * 2, g,
              lambda NV, tt, uu, V_: pramp_uv('amber', sval(NV, hi=.28) - .06 * tt), sides=7, cap0=False, cap1=True, normals=np.tile([1., 0, 0], (6, 1)))
        TASSELS.append({'name': 'tassel_%d' % k, 'hang_point_blender': H_.round(4).tolist(), 'length_m': round(L_ + .012, 3)})
    # ---- paint, materials, objects, export
    patlas = np.empty((512, 512, 4), np.uint8); patlas[:] = [217, 87, 62, 255]
    for nm, (x0, y0, w, h) in PCH.items():
        if nm == 'pramp':
            Uu, Vv = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), (np.arange(h) + .5) / h)
            rows_ = np.clip((Vv * h / 32).astype(int), 0, len(PRAMPS) - 1); C = np.zeros((h, w, 3))
            for k, nm2 in enumerate(PRAMPS):
                m = rows_ == k; C[m] = ramp_colour(nm2, Uu[m])
        else:
            Uu, Vv = np.meshgrid(clamp((np.arange(w) - 4) / (w - 8)), clamp((np.arange(h) - 4) / (h - 8)))
            C = paint_canopy(Uu, Vv)
        patlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(C) * 255).astype(np.uint8)
    ppath = os.path.join(ROOT, 'stella-parasol_atlas.png'); write_png(ppath, patlas)
    pimg = bpy.data.images.load(ppath); pimg.name = 'Stella_wagasa_atlas_512'; pimg.pack()
    PMAT = bpy.data.materials.new('Stella_wagasa'); PMAT.use_nodes = True
    pb = PMAT.node_tree.nodes.get('Principled BSDF'); pb.inputs['Roughness'].default_value = .75; pb.inputs['Metallic'].default_value = 0
    pb.inputs['Specular IOR Level'].default_value = .25
    ptx = PMAT.node_tree.nodes.new('ShaderNodeTexImage'); ptx.image = pimg; ptx.interpolation = 'Linear'
    PMAT.node_tree.links.new(ptx.outputs['Color'], pb.inputs['Base Color'])
    GMAT = bpy.data.materials.new('Stella_wagasa_sun_glow'); GMAT.use_nodes = True        # gold #E8B44A: value 0.91, under pure white
    gb = GMAT.node_tree.nodes.get('Principled BSDF'); gold_ = tuple(float(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4) for c in rgb('#E8B44A')) + (1.,)
    gb.inputs['Base Color'].default_value = gold_; gb.inputs['Roughness'].default_value = .45; gb.inputs['Metallic'].default_value = .2
    gb.inputs['Emission Color'].default_value = gold_; gb.inputs['Emission Strength'].default_value = .6
    PROP_STATS = {}
    obp = finish_group(parts['prop_main'], 'stella_parasol', (0, 0, 0), PMAT)
    obg = finish_group(parts['prop_glow'], 'sun_disc_glow', (0, 0, 0), GMAT)
    obt = [finish_group(parts['prop_tassel_%d' % k], 'tassel_%d' % k, tuple(TASSELS[k]['hang_point_blender']), PMAT) for k in range(8)]
    fin = bpy.data.objects.new('finial', None); fin.empty_display_type = 'SPHERE'; fin.empty_display_size = .03
    fin.location = tuple(float(c) for c in FINIAL); bpy.context.collection.objects.link(fin)
    for o_ in [obp, obg] + obt:
        PROP_STATS[o_.name] = {'triangles': len(o_.data.loop_triangles),
                               'z_range_m': [round(min((o_.matrix_world @ v.co).z for v in o_.data.vertices), 4), round(max((o_.matrix_world @ v.co).z for v in o_.data.vertices), 4)]}
    PROP_STATS['total_triangles'] = sum(v['triangles'] for v in PROP_STATS.values())
    PROP_STATS['canopy_across_m'] = round(2 * max(math.hypot(*(obp.matrix_world @ v.co)[:2]) for v in obp.data.vertices), 3)
    assert PROP_STATS['total_triangles'] <= 6000, PROP_STATS
    bpy.ops.object.select_all(action='DESELECT')
    for o_ in [obp, obg, fin] + obt: o_.select_set(True)
    bpy.context.view_layer.objects.active = obp
    bpy.ops.export_scene.gltf(filepath=PROP_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False, export_animations=False)
    def gm(v): return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]     # Blender -> game axes
    top_z = float(PROP_STATS['sun_disc_glow']['z_range_m'][1]); hook_z = float(hkp[:, 2].min()) - .016
    MOUNT = {'units': 'metres. Blender Z-up / front -Y; game axes = (x, z, -y). The wagasa lies along its local +Z (game +Y), the canopy at +Z.',
             'stella-parasol.glb': {'prop': 'the sun wagasa (phase 3; replaces the jellyfish parasol)',
                                    'pivot': 'the grip (the origin), on the shaft just above the crook', 'axis_blender': [0, 0, 1], 'axis_game': [0, 1, 0],
                                    'grip': [0, 0, 0], 'grip_radius_m': .021, 'grip_length_m': .150,
                                    'finial_blender': FINIAL.round(4).tolist(), 'finial_game': gm(FINIAL),
                                    'top_game': gm([0, 0, top_z]), 'top_pearl_game': gm([0, 0, top_z]),
                                    'hook_bottom_blender': [0, 0, round(hook_z, 4)], 'canopy_rim_z_m': round(W_APEX - W_DROP, 3), 'canopy_radius_m': W_R,
                                    'canopy_across_m': PROP_STATS['canopy_across_m'], 'shaft_length_m': round(W_APEX - hook_z, 3),
                                    'overall_height_m': round(top_z - hook_z, 3),
                                    'tassels': [dict(t, hang_point_game=gm(t['hang_point_blender'])) for t in TASSELS],
                                    'nodes': {'stella_parasol': 'canopy, ribs, rim, shaft, grip, crook (the 512 atlas)', 'sun_disc_glow': 'the gold sun disc (material Stella_wagasa_sun_glow)',
                                              'finial': 'an empty at the sun disc centre: where her light leaves the wagasa', 'tassel_0..7': 'one mesh each, its origin where it hangs'},
                                    'use': 'held in one paw over the shoulder when walking (the canopy behind the head), raised overhead to cast'},
             'stats': PROP_STATS}
    with open(os.path.join(ROOT, 'prop_mount.json'), 'w', encoding='utf-8') as f: json.dump(MOUNT, f, indent=2)
    print('PROPS_DONE', json.dumps(PROP_STATS), flush=True)
