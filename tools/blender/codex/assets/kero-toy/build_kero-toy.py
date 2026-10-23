"""Kero / Pond Guardian (Toybox villager, VL-1), Opus build, phase 1 (the model). Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_kero-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/kero-toy.glb (--fast: writes scratch/kero-fast.glb instead).

Technique (the Pan / Mochi / Kuma toy-line machinery):
- The head is ONE smooth implicit: a wide frog skull (a superquadric, the jowls widest 0.25 W above the chin, a flat-ish
  top, round in plan, a broad low snout swelling) with the two EYE DOMES smooth-unioned in (forward-leaning ellipsoids,
  smin k 0.045 W): one surface, so the domes meet the skull and each other in a smooth concave fillet, no seam, no crease.
  The skin is the field's zero surface reached by radial projection (CDT in a stereographic domain, edge loops round both
  eye holes and the mouth, fine triangles over the face and the domes' valley), every vertex on the surface with the
  field's analytic normal. The lash lines, brows, nostrils, smile and blush are painted on it from 3D positions.
- The eyes are separate flush lens globes in real eye holes (the rig adds the lids in phase 2).
- The torso is a pear (a lathe-profile implicit) painted through two charts (the belly oval from 3D positions); the
  arms + three-finger hands and the legs + broad three-toed feet are each ONE implicit meshed as a tube whose end cap is
  projected onto the hand / foot (bend loops along the limb, no seam at the wrist or ankle); the scarf a soft roll, the
  knot's two rounded ends SDF blobs, the lily-pad badge a pillow with its notch.
- One material, one 2048 painted atlas (head charts, two eye charts, two torso charts, 1-D shading ramps).
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FAST = '--fast' in ARGV
RIG = bool(globals().get('RIG_MODE'))      # phase 2 hook (part labels); no approved file written
MODEL = 'D:/projects/chewy-life-3d/public/models/kero-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'kero-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}
PAL = {'skin': '#8ad86a', 'skinshade': '#6fbe55', 'skinlight': '#9bdd79', 'belly': '#e8f8c8', 'bellyshade': '#cde6a6',
       'bellylight': '#f3fde0', 'scarf': '#e8503a', 'scarfshade': '#c53e2c', 'scarflight': '#f56f58', 'pad': '#4f963f',
       'padshade': '#3d7c31', 'padlight': '#6cb257', 'nostril': '#467c38', 'mouth': '#3f6b2b', 'brow': '#447330',
       'blush': '#f0a08a', 'sclera': '#fff8e9', 'iris': '#e8a23b', 'pupil': '#242522', 'lash': '#242522',
       'throat': '#c4e6a2', 'dark': '#2a2a26'}

# >>> HEAD_SDF (pure numpy: scratch tools exec this block to fit the head)
# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround: dome tops y 105, ground y 513 -> 1.10 m (370.9 px / m); head close-up: W = 353 px at the cheeks, chin y 809
# (the lower outline's superellipse fit; the scarf hides it). Model y = 0 is the leg / hip axis, the head centre sits ahead.
W = .800; CHIN = .571; HY = -.062           # head width at the cheeks, chin height, head centre y (metres)
SW = W / .44                              # Rosie's metric detail sizes (authored at W 0.44) scale by SW
def rgb(c):
    h = PAL.get(c, c).lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
def clamp(x): return np.clip(x, 0, 1)
def smooth(a, b, x):
    t = clamp((np.asarray(x, dtype=float) - a) / (b - a)); return t * t * (3 - 2 * t)
def mix(a, b, t):
    t = np.asarray(t, dtype=float)
    return np.asarray(a) * (1 - t[..., None]) + np.asarray(b) * t[..., None]
def spow(x, p): return np.sign(x) * np.abs(x) ** p
def unit(v): return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)
def ell(q, c, r):
    q = (q - np.asarray(c, float)) / np.asarray(r, float)
    k0 = np.sqrt((q * q).sum(-1)); k1 = np.sqrt(((q / np.asarray(r, float)) ** 2).sum(-1))
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def sell(q, c, r, p, pzlo=None, rzlo=None):
    """superellipsoid, first-order distance (value / |gradient|); optional flatter lower half (pzlo, rzlo)"""
    r = np.asarray(r, float); p = np.asarray(p, float); dq = q - np.asarray(c, float)
    rz = r[2] if rzlo is None else np.where(dq[..., 2] < 0, rzlo, r[2])
    pz = p[2] if pzlo is None else np.where(dq[..., 2] < 0, pzlo, p[2])
    a = np.abs(dq[..., 0]) / r[0] + 1e-12; b = np.abs(dq[..., 1]) / r[1] + 1e-12; c_ = np.abs(dq[..., 2]) / rz + 1e-12
    F = a ** p[0] + b ** p[1] + c_ ** pz; pm = (p[0] + p[1] + p[2]) / 3
    g = np.sqrt((p[0] * a ** (p[0] - 1) / r[0]) ** 2 + (p[1] * b ** (p[1] - 1) / r[1]) ** 2 + (pz * c_ ** (pz - 1) / rz) ** 2)
    return (F ** (1 / pm) - 1) / np.maximum((1 / pm) * F ** (1 / pm - 1) * g, 1e-9)
def smin(a, b, k):
    h = np.clip(.5 + .5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h)
def smax(a, b, k): return -smin(-a, -b, k)

# ---------------------------------------------------------------- the head (W units, z above the chin, y from HY)
# the skull: a wide superquadric, the jowls widest 0.25 W above the chin, a flat-ish top 0.566 W (the valley between the
# domes), round in plan; the frog's snout: a broad, low swelling of the front depth (no muzzle ellipsoid, so no outline
# under the mouth). The eye domes: two forward-leaning ellipsoids smooth-unioned in (one skull, no crease).
# Fitted by scratch/fit_head.py to 93 measured outline points (front widths, the dome/valley top, both profiles): rms 0.0051 W, with the eye column
# making the profile above z 0.40, the forehead between the domes set back and the eyes facing ~28 deg out.
HEAD = dict(A=0.498, BF=0.3156, BB=0.3842, ZC=0.2424, HT=0.3272, HB=0.2424, nA_t=2.2103, nA_b=2.1967, nB_t=2.9039, nB_b=5.5645, nBb_t=2.2823, nBb_b=3.5393, n=2, egg=0.0002)
MUZ = dict(m=0.236, z=0.2315, wz=0.1353, wx=0.42, brow=0.35, bw=0.18)
DOME = dict(x=0.2492, y=-0.0038, z=0.457, rx=0.1885, ry=0.1928, rz=0.2237, tilt=45.7928, p=2, k=0.0328)
def prof(z, m_t, m_b):
    zc = HEAD['ZC']; v = np.where(z >= zc, (z - zc) / HEAD['HT'], (zc - z) / HEAD['HB'])
    m = np.where(z >= zc, m_t, m_b); vv = np.clip(v, 0, 1)
    return np.maximum(np.clip(1 - vv ** m, 0, 1) ** (1 / m), 1e-4), v
def skull_local(q):
    """the frog skull as one superellipsoid-type implicit: in each direction the section radius and the height obey
    (r / R0)^m + v^m = 1 (the fitted profiles), so F = (s0^m + v^m)^(1/m) - 1 has no degenerate apex and no cap; scaled
    to a first-order distance (the vertical share by H, the radial by R0) so the domes' smooth union makes a real fillet"""
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    sw = 1 + MUZ['m'] * np.exp(-((z - MUZ['z']) / MUZ['wz']) ** 2) * np.exp(-(x / MUZ['wx']) ** 2)
    # the brow recess: between the domes the forehead sits back, so the domes (and the eyes) make the profile
    sw = sw * (1 - MUZ['brow'] * smooth(.30, .56, z) * np.exp(-(x / MUZ['bw']) ** 2))
    front = y < 0
    a0 = HEAD['A'] * np.ones_like(x); b0 = np.where(front, HEAD['BF'] * sw, HEAD['BB'])
    n = HEAD['n']; tx = np.abs(x / a0) ** n; ty = np.abs(y / b0) ** n
    s0 = (tx + ty) ** (1 / n); wx = tx / np.maximum(tx + ty, 1e-12)
    top = z >= HEAD['ZC']
    m = np.where(top, wx * HEAD['nA_t'] + (1 - wx) * np.where(front, HEAD['nB_t'], HEAD['nBb_t']),
                      wx * HEAD['nA_b'] + (1 - wx) * np.where(front, HEAD['nB_b'], HEAD['nBb_b']))
    H = np.where(top, HEAD['HT'], HEAD['HB']); vz = np.abs(z - HEAD['ZC']) / H
    P = s0 ** m + vz ** m; F = P ** (1 / m) - 1
    r = np.sqrt(x * x + y * y); R0 = np.where(s0 > 1e-6, r / np.maximum(s0, 1e-6), (a0 ** -4 + b0 ** -4) ** -.25)
    wt = vz ** m / np.maximum(P, 1e-12)
    return F * (wt * H + (1 - wt) * R0)
def dome_local(q):
    t = math.radians(DOME['tilt']); c, s = math.cos(t), math.sin(t)
    out = None
    for sx in (-1, 1):
        dq = q - np.array([sx * DOME['x'], DOME['y'], DOME['z']])
        # tilt about x: + leans the dome's top forward (-y)
        dy = c * dq[..., 1] + s * dq[..., 2]; dz = -s * dq[..., 1] + c * dq[..., 2]
        r = np.stack([dq[..., 0], dy, dz], -1)
        d = sell(r, [0, 0, 0], [DOME['rx'], DOME['ry'], DOME['rz']], (DOME['p'], DOME['p'], DOME['p']))
        out = d if out is None else np.minimum(out, d)
    return out
def head_local(q): return smin(skull_local(q), dome_local(q), DOME['k'])
def front_local(x, z, f):
    """first surface hit marching from the front (-y) at (x, z), W units, vectorised"""
    x = np.atleast_1d(np.asarray(x, float)); z = np.atleast_1d(np.asarray(z, float)); n = len(x)
    ys = np.linspace(-.80, .30, 280)
    P = np.stack([np.repeat(x[:, None], len(ys), 1), np.broadcast_to(ys, (n, len(ys))),
                  np.repeat(z[:, None], len(ys), 1)], -1).reshape(-1, 3)
    ins = (f(P) < 0).reshape(n, len(ys)); i = np.argmax(ins, 1); ok = ins[np.arange(n), i]
    lo = ys[np.maximum(i - 1, 0)]; hi = ys[i]
    for _ in range(26):
        m = (lo + hi) / 2; inn = f(np.stack([x, m, z], -1)) < 0
        hi = np.where(inn, m, hi); lo = np.where(inn, lo, m)
    return np.where(ok, (lo + hi) / 2, np.nan)
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
# <<< HEAD_SDF
if RIG:   # phase 2 (rig-mode build only): the forehead recess between the domes eased slightly (depth only, invisible from
    # the front), so the inner corners of the upper lids can hide above the eye at rest and through the squint
    MUZ['brow'] = float(os.environ.get('RIG_BROW', str(MUZ['brow'])))   # default: the approved value (easing measured: no help)

def smoother(a, b, x):
    t = clamp((np.asarray(x, float) - a) / (b - a)); return t * t * t * (t * (6 * t - 15) + 10)
def grad(f, p, e=1.5e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
def front_hit(x, z, f=head_sdf):
    """metres in, metres out"""
    return HY + W * front_local(np.asarray(x) / W, (np.asarray(z) - CHIN) / W, lambda q: f(L2M(q)) / W)
O = np.array([0, HY, CHIN + .30 * W])                 # every ray from here meets the skin once
def radial_hit(d, f=head_sdf, o=O, t0=.02, t1=.75, it=34):
    lo = np.full(len(d), t0); hi = np.full(len(d), t1)
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def grad_n(p, f=head_sdf, e=1.5e-4): return grad(f, p, e)
def ray_outer(f, o, d, t0=.0, t1=.8, steps=96, it=26):
    """outermost zero crossing of f along rays o + t d (o inside); vectorised"""
    o = np.broadcast_to(np.asarray(o, float), d.shape); ts = np.linspace(t1, t0, steps); n = len(d)
    P = o[:, None, :] + d[:, None, :] * ts[None, :, None]
    ins = (f(P.reshape(-1, 3)) < 0).reshape(n, steps); i = np.argmax(ins, 1)
    lo = ts[i]; hi = ts[np.maximum(i - 1, 0)]
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def ao(f, P, N, dist=.03):
    """cheap ambient occlusion from the field: 0 open .. 1 buried (other parts within dist along the normal)"""
    v = f(P + N * dist) / dist; return clamp(1 - v)
def to_dom(d):
    den = 1 - d[:, 1]; return np.stack([2 * d[:, 0] / den, 2 * d[:, 2] / den], -1)
def from_dom(uv):
    r2 = (uv * uv).sum(1); den = 4 + r2
    return np.stack([4 * uv[:, 0] / den, -(4 - r2) / den, 4 * uv[:, 1] / den], -1)
AMAX = math.radians(122); BMAX = math.radians(72); A_SPLIT = math.radians(116)
def az_uv(d, amax):
    a = np.arccos(np.clip(-d[:, 1], -1, 1)); psi = np.arctan2(d[:, 2], d[:, 0]); r = np.minimum(a / amax, 1) * .5
    return np.stack([.5 + r * np.cos(psi), .5 + r * np.sin(psi)], -1)
def az_dir(U, V, amax):
    du = U - .5; dv = V - .5; a = np.minimum(np.sqrt(du * du + dv * dv) * 2, 1) * amax; psi = np.arctan2(dv, du)
    return np.stack([np.sin(a) * np.cos(psi), -np.cos(a), np.sin(a) * np.sin(psi)], -1)
def azb_uv(d, bmax):
    b = np.arccos(np.clip(d[:, 1], -1, 1)); psi = np.arctan2(d[:, 2], -d[:, 0]); r = np.minimum(b / bmax, 1) * .5
    return np.stack([.5 + r * np.cos(psi), .5 + r * np.sin(psi)], -1)
def azb_dir(U, V, bmax):
    du = U - .5; dv = V - .5; b = np.minimum(np.sqrt(du * du + dv * dv) * 2, 1) * bmax; psi = np.arctan2(dv, du)
    return np.stack([-np.sin(b) * np.cos(psi), np.cos(b), np.sin(b) * np.sin(psi)], -1)

# ---------------------------------------------------------------- atlas charts and shading ramps
# 2048 atlas charts (x, y, w, h) in pixels, y up (Blender UV convention)
CHARTS = {'head': (0, 768, 1280, 1280), 'headback': (1280, 1280, 768, 768),
          'eye.L': (1280, 896, 384, 384), 'eye.R': (1664, 896, 384, 384),
          'torso': (0, 0, 768, 768), 'torsoback': (768, 256, 512, 512), 'ramp': (1280, 0, 768, 256)}
if RIG:   # phase 2: the rig's upper and lower lids, the mouth cavity and the tongue, in unused atlas space
    CHARTS.update({'lidU.L': (1280, 576, 384, 320), 'lidU.R': (1664, 576, 384, 320), 'lidD.L': (1280, 256, 256, 160),
                   'lidD.R': (1536, 256, 256, 160), 'cavity': (1792, 256, 128, 128), 'tongue': (1920, 256, 128, 128)})
PAINT_OPTS = {'lash': True}     # the rig paints its lids from this face paint with the lash line off
RAMPS = {'skin': ('skinshade', 'skin', 'skinlight'), 'belly': ('bellyshade', 'belly', 'bellylight'),
         'scarf': ('scarfshade', 'scarf', 'scarflight'), 'pad': ('padshade', 'pad', 'padlight'),
         'dark': ('dark', 'dark', 'pupil')}
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
def au(chart, u, v):
    x, y, w, h = CHARTS[chart]; g = 6
    return np.stack([(x + g + np.asarray(u, float) * (w - 2 * g)) / 2048, (y + g + np.asarray(v, float) * (h - 2 * g)) / 2048], -1)
def ramp_uv(name, val):
    x, y, w, h = CHARTS['ramp']; val = clamp(np.asarray(val, float))
    return np.stack([(x + 8 + val * (w - 16)) / 2048, np.full(val.shape, (y + RAMP_ROWS[name] * 32 + 16) / 2048)], -1)
def ramp_colour(name, u):
    lo, base, hi = [rgb(c) for c in RAMPS[name]]; u = clamp(np.asarray(u, float))
    return np.where((u < .5)[..., None], mix(lo, base, smooth(0, .5, u)), mix(base, hi, smooth(.5, 1, u)))
LIGHT = unit(np.array([-.22, -.35, 1.]))
def sval(n, occ=0., hi=.26, lo=.26):
    """painted soft shading: 0.5 = base colour, lighter toward the key light, darker below / occluded"""
    d = np.asarray(n) @ LIGHT
    return clamp(.50 + hi * smooth(.0, .95, d) - lo * smooth(.05, .95, -d) - occ)

# ---------------------------------------------------------------- face layout (front projection, metres; sheet-measured)
EX = .289 * W; EZ = CHIN + .419 * W; EHW = .113 * W; EHH = .110 * W; EN = 2.15
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi)
    return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
# the smile (W units, his right half; mirrored): corners 0.25 W out at z 0.250, dips at +-0.13 (z 0.218), centre 0.231
MOUTH_PTS = [(-.262, .262), (-.250, .250), (-.222, .239), (-.198, .230), (-.170, .222), (-.130, .218), (-.090, .219),
             (-.050, .226), (0., .231)]
MOUTH_PTS = MOUTH_PTS + [(-x, z) for x, z in MOUTH_PTS[-2::-1]]
MC = CHIN + .231 * W; MHW = .250 * W
NOSTRIL = (.054 * W, CHIN + .322 * W)
BROW = [(-.353, .591), (-.321, .603), (-.289, .608), (-.257, .603), (-.225, .591)]     # his right brow (x, z) W: an even arc over the eye (round 2)
BLUSH = (.395 * W, CHIN + .258 * W, .060 * W, .043 * W)

# ============================================================== geometry helpers
parts = {}
def mesh(name, verts, faces, uvs, chart, group, raw_uv=False, sharp=None, normals=None, recalc=True):
    """per-face UV lists (chart-local unless raw_uv)"""
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(int(i) for i in f) for f in faces]); me.update()
    uv = me.uv_layers.new(name='Atlas')
    for p, coords in zip(me.polygons, uvs):
        p.use_smooth = True
        for li, co in zip(p.loop_indices, coords): uv.data[li].uv = tuple(co) if raw_uv else tuple(au(chart, *co))
    bm = bmesh.new(); bm.from_mesh(me)
    if recalc: bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if sharp:
        sv = set(sharp)
        for e in bm.edges:
            if e.verts[0].index in sv and e.verts[1].index in sv: e.smooth = False
    bm.to_mesh(me); bm.free()
    if normals is not None:
        a = me.attributes.new('cust_n', 'FLOAT_VECTOR', 'POINT')
        a.data.foreach_set('vector', unit(np.asarray(normals, float)).astype(np.float32).ravel())
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    parts.setdefault(group, []).append(ob); return ob
def make_obj(name, V, F, UV, group, N=None, recalc=True):
    """UV: per-vertex array (len V, atlas coords) or a list of per-face corner lists (atlas coords)"""
    V = np.asarray(V, float)
    me = bpy.data.meshes.new(name); me.from_pydata(V.tolist(), [], [tuple(int(i) for i in f) for f in F]); me.update()
    uvl = me.uv_layers.new(name='Atlas')
    lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    if isinstance(UV, list): uvs = np.array([c for f in UV for c in f], float)
    else: uvs = np.asarray(UV, float)[lv]
    uvl.data.foreach_set('uv', uvs.astype(np.float32).ravel())
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    if recalc:
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    if N is not None:
        a = me.attributes.new('cust_n', 'FLOAT_VECTOR', 'POINT')
        a.data.foreach_set('vector', unit(np.asarray(N, float)).astype(np.float32).ravel())
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    parts.setdefault(group, []).append(ob); return ob
def cube_sphere(n):
    """unit directions of a cube-sphere (equal-angle), shared vertices, outward quads"""
    t = np.tan(np.linspace(-PI / 4, PI / 4, n + 1)); key = {}; V = []; F = []
    def vid(p):
        k = tuple(np.round(p, 6))
        if k not in key: key[k] = len(V); V.append(p)
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
    return np.array(V), F
def sdf_ball(name, f, centre, n, group, ramp, scale=(1, 1, 1), occ_f=None, occ_k=.35, shade=None, t1=.8, orient=None):
    """mesh the zero set of f by radial projection of a cube-sphere from centre (analytic normals, ramp UVs)"""
    D, F = cube_sphere(n); D = D * np.asarray(scale, float)
    if orient is not None: D = D @ np.asarray(orient, float).T
    D = unit(D)
    P = ray_outer(f, centre, D, t1=t1); N = grad(f, P)
    occ = occ_k * ao(occ_f, P, N) if occ_f is not None else 0.
    val = shade(P, N) if shade is not None else sval(N, occ)
    return make_obj(name, P, F, ramp_uv(ramp, val), group, N), P, N
def catmull(points, t):
    pts = [np.asarray(p, float) for p in points]; n = len(pts) - 1; k = min(int(t * n), n - 1); f = t * n - k
    p0, p1, p2, p3 = pts[max(0, k - 1)], pts[k], pts[k + 1], pts[min(n, k + 2)]
    return .5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)
def seg_dist(p, a, b, ra, rb):
    """distance to a capsule segment a->b with radius linearly ra->rb (first order)"""
    ab = b - a; L2 = ab @ ab; t = np.clip(((p - a) @ ab) / L2, 0, 1)
    return np.linalg.norm(p - (a + t[..., None] * ab), axis=-1) - (ra + (rb - ra) * t)
def sdf_limb(name, f, points, sides, n_rows, n_cap, group, ramp, occ_f=None, occ_k=.35, dense=90, cap_len=1.0, shade=None,
             ref=np.array([0, 1., 0]), t1=.6):
    """mesh the zero set of f as a tube: rays perpendicular to a Catmull-Rom centreline (bend loops), then an end cap of
    rays from the last centreline point (the hand / foot is projected onto it); rows resampled to even arc length.
    Returns the object and the row parameters (for joints)."""
    def frame(t):
        p = catmull(points, t); d = unit(catmull(points, min(1, t + .002)) - catmull(points, max(0, t - .002)))
        return p, d
    # parallel-transport frames on a dense parameter set
    ts = np.linspace(0, 1, dense); frames = []; old = None
    for t in ts:
        p, d = frame(t)
        r0 = ref if abs(d @ ref) < .95 else np.array([1., 0, 0])
        x = unit(np.cross(d, r0)) if old is None else unit(old - d * (old @ d)); y = np.cross(d, x); old = x
        frames.append((p, d, x, y))
    ang = 2 * PI * np.arange(sides) / sides
    def tube_row(k):
        p, d, x, y = frames[k]; D = np.outer(np.cos(ang), x) + np.outer(np.sin(ang), y)
        return ray_outer(f, p, D, t1=t1)
    pE, dE, xE, yE = frames[-1]
    caps = np.linspace(0, PI / 2, dense // 2 + 1)[1:-1]
    def cap_row(a):
        D = unit((np.outer(np.cos(ang), xE) + np.outer(np.sin(ang), yE)) * math.cos(a) + dE * (math.sin(a) * cap_len))
        return ray_outer(f, pE, D, t1=t1)
    rows = [tube_row(k) for k in range(dense)] + [cap_row(a) for a in caps]
    tip = ray_outer(f, pE, dE[None], t1=t1)[0]
    R = np.array(rows); seg = np.linalg.norm(np.diff(R, axis=0), axis=2).mean(1); s = np.concatenate([[0], np.cumsum(seg)])
    s = np.concatenate([s, [s[-1] + np.linalg.norm(R[-1] - tip, axis=1).mean()]])
    # even arc length: n_rows over the tube part, n_cap over the cap part (the split at the tube's end)
    s_t = s[dense - 1]; tgt = np.concatenate([np.linspace(0, s_t, n_rows), np.linspace(s_t, s[-1], n_cap + 2)[1:-1]])
    idx = np.searchsorted(s, tgt, side='right') - 1; idx = np.clip(idx, 0, len(R) - 2)
    w = (tgt - s[idx]) / np.maximum(s[idx + 1] - s[idx], 1e-12)
    # re-project the interpolated rows onto the surface along the same family of rays (exact, not chords)
    out = []
    params = []
    for i_, w_ in zip(idx, w):
        if i_ < dense - 1:
            t = ts[i_] + (ts[i_ + 1] - ts[i_]) * w_; p, d = frame(t)
            fr = frames[i_]; x = unit(fr[2] - d * (fr[2] @ d)); y = np.cross(d, x)
            D = np.outer(np.cos(ang), x) + np.outer(np.sin(ang), y); out.append(ray_outer(f, p, D, t1=t1)); params.append(('t', float(t)))
        else:
            j = i_ - (dense - 1); a0 = 0. if j == 0 else caps[j - 1]; a1 = caps[j] if j < len(caps) else PI / 2
            a = a0 + (a1 - a0) * w_
            out.append(cap_row(a) if a < PI / 2 - 1e-4 else np.repeat(tip[None], sides, 0)); params.append(('a', float(a)))
    V = np.concatenate(out + [tip[None], pE[None] * 0 + (frames[0][0] - frames[0][1] * .01)[None]])
    nr = len(out); tipi = nr * sides; sti = tipi + 1; F = []
    for j in range(nr - 1):
        for i in range(sides):
            a_, b_ = j * sides + i, j * sides + (i + 1) % sides
            F.append((a_, b_, b_ + sides, a_ + sides))
    for i in range(sides): F.append(((nr - 1) * sides + i, (nr - 1) * sides + (i + 1) % sides, tipi))
    for i in range(sides): F.append(((i + 1) % sides, i, sti))
    N = grad(f, V); N[sti] = -frames[0][1]
    occ = occ_k * ao(occ_f, V, N) if occ_f is not None else 0.
    val = shade(V, N) if shade is not None else sval(N, occ)
    return make_obj(name, V, F, ramp_uv(ramp, val), group, N), params
def cull_buried(ob, f, margin):
    """delete the faces whose every vertex is buried deeper than margin inside f (hidden surface)"""
    me = ob.data; co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    mw = np.array(ob.matrix_world); co = co @ mw[:3, :3].T + mw[:3, 3]
    deep = f(co) < -margin
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    kill = [fc for fc in bm.faces if all(deep[v.index] for v in fc.verts)]
    if kill: bmesh.ops.delete(bm, geom=kill, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(me); bm.free(); me.update()
    return len(kill)

# ============================================================== HEAD SKIN: CDT on the ball, eye / mouth loops
pts = []; cons = []; tags = {}
def add_loop(P, tag, closed=True):
    i0 = len(pts); pts.extend([tuple(p) for p in P]); n = len(P)
    for i in range(n if closed else n - 1): cons.append((i0 + i, i0 + (i + 1) % n))
    tags[tag] = list(range(i0, i0 + n)); return tags[tag]
def surf_dir(x, z):
    y = front_hit(x, z); return unit(np.stack([np.asarray(x, float) * np.ones_like(y), y, np.asarray(z, float) * np.ones_like(y)], -1) - O)

NE = 48
EYE_SCALES = [1.0, 1.06, 1.13, 1.21, 1.30, 1.40]
eye_dom = {}
for s in (-1, 1):
    psi = np.linspace(0, 2 * PI, NE, endpoint=False)
    x, z = eye_xz(s, psi); base = to_dom(surf_dir(x, z)); c = to_dom(surf_dir(np.array([s * EX]), np.array([EZ])))[0]
    eye_dom[s] = (c, base)
    wn = (1 - .45 * smooth(-.10, -.80, np.cos(psi))) * (1 - .50 * smooth(-.2, -.9, np.sin(psi)))   # tighter toward the nose / mouth
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
# the smile: loops that follow its curve (above / below), the ends rounded
_mp = np.array(MOUTH_PTS)
def mouth_curve(u):           # u in [-1, 1] -> (x, z) W
    return np.stack([np.interp(u, np.linspace(-1, 1, len(_mp)), _mp[:, 0]), np.interp(u, np.linspace(-1, 1, len(_mp)), _mp[:, 1])], -1)
MOUTH_LOOPS = [(.012, .014, .016), (.022, .025, .028), (.034, .037, .041)]   # (end pad, above, below) W
for k, (pe, ha, hb) in enumerate(MOUTH_LOOPS):
    a = np.linspace(0, 2 * PI, 72, endpoint=False); u = np.cos(a)
    c_ = mouth_curve(np.clip(u, -1, 1)); xx = c_[:, 0] * (1 + pe / .262 * np.abs(u) ** 6); zz = c_[:, 1] + np.where(np.sin(a) > 0, ha, hb) * np.sin(a)
    add_loop(to_dom(surf_dir(xx * W, CHIN + zz * W)), 'mouth_%d' % k)
NB = 12; AB = math.radians(176)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
# fill: a dense Fibonacci set of directions thinned to a spacing field (fine on the face, the domes and their valley,
# medium on the crown, coarser on the back), deterministic greedy order
NF = 70000; ii = np.arange(NF) + .5
phi = np.arccos(1 - 2 * ii / NF); th = PI * (1 + 5 ** .5) * ii
D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1)); D = D[alpha < math.radians(173.5)]
Pf = radial_hit(D); q = M2L(Pf)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1))
band_face = smooth(.56, .47, np.abs(q[:, 0])) * smooth(.12, .19, q[:, 2]) * smooth(math.radians(82), math.radians(68), alpha)
band_top = smooth(.46, .53, q[:, 2]) * smooth(.47, .40, np.abs(q[:, 0])) * smooth(.22, .12, q[:, 1])
band = np.maximum(band_face, band_top)
hsp = (.0180 + (.0370 - .0180) * smooth(math.radians(100), math.radians(125), alpha)) * (1.4 if FAST else 1.)
hsp = hsp * (1 - band) + .0115 * band * (1.4 if FAST else 1.)
# the domes' fillet (where the skull and dome fields cross): fine triangles, so the toon terminator stays clean there
fil = smooth(.050, .018, np.abs(skull_local(q) - dome_local(q))) * smooth(.34, .42, q[:, 2])
hsp = np.minimum(hsp, hsp * (1 - fil) + .0084 * fil * (1.4 if FAST else 1.))
order = np.argsort(hsp + 1e-7 * np.arange(len(D)), kind='stable')   # the finest spacing first, then Fibonacci order
cell = float(hsp.max()); grid = {}; keepi = []
for i in order:
    p = Pf[i]; key = tuple(np.floor(p / cell).astype(int)); ok = True
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for j in grid.get((key[0] + dx, key[1] + dy, key[2] + dz), ()):
                    if np.sum((Pf[j] - p) ** 2) < (.40 * (hsp[i] + hsp[j])) ** 2:
                        ok = False; break
                if not ok: break
            if not ok: break
    if ok:
        grid.setdefault(key, []).append(i); keepi.append(i)
keepi = np.array(sorted(keepi)); D = D[keepi]; Pf = Pf[keepi]
dom = to_dom(D)
def ring_rr(dp, c, ring):
    outer = np.array([pts[i] for i in ring])
    ang_b = np.arctan2(outer[:, 1] - c[1], outer[:, 0] - c[0]); rad_b = np.linalg.norm(outer - c, axis=1)
    order_ = np.argsort(ang_b); ab = np.concatenate([ang_b[order_] - 2 * PI, ang_b[order_], ang_b[order_] + 2 * PI]); rb = np.tile(rad_b[order_], 3)
    v = dp - c; return np.linalg.norm(v, axis=1) / np.interp(np.arctan2(v[:, 1], v[:, 0]), ab, rb)
keep = np.ones(len(dom), bool)
for s in (-1, 1):
    keep &= ring_rr(dom, eye_dom[s][0], tags['eye%d_%d' % (s, len(EYE_SCALES) - 1)]) > 1.06
frontp = Pf[:, 1] < HY
def in_poly(P, poly):
    x = P[:, 0]; y = P[:, 1]; inside = np.zeros(len(P), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        inside ^= ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1)
    return inside
_mo = np.array([pts[i] for i in tags['mouth_%d' % (len(MOUTH_LOOPS) - 1)]])
keep &= ~(frontp & in_poly(dom, _mo))
# keep fill points a little clear of the outer mouth loop
_mseg = np.array([pts[i] for i in tags['mouth_%d' % (len(MOUTH_LOOPS) - 1)]])
_dm = np.min(np.linalg.norm(dom[:, None, :] - _mseg[None, ::2, :], axis=2), axis=1)
keep &= ~(frontp & (_dm < .006))
keep &= np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(173.0)
fill0 = len(pts); pts.extend([tuple(p) for p in dom[keep]])
LOG['skin_fill_points'] = int(keep.sum())
def loop_clash():
    """names of constraint loops whose segments cross (diagnostic)"""
    P = np.array(pts); segs = []; owner = []
    for tg, ids in tags.items():
        if len(ids) < 3: continue
        for i in range(len(ids)): segs.append((ids[i], ids[(i + 1) % len(ids)])); owner.append(tg)
    A = P[[a for a, b in segs]]; B = P[[b for a, b in segs]]; out = set()
    def cr(o, a, b): return (a[..., 0] - o[..., 0]) * (b[..., 1] - o[..., 1]) - (a[..., 1] - o[..., 1]) * (b[..., 0] - o[..., 0])
    for i in range(len(segs)):
        d1 = cr(A[i], B[i], A); d2 = cr(A[i], B[i], B); d3 = cr(A, B, A[i][None]); d4 = cr(A, B, B[i][None])
        hit = (d1 * d2 < 0) & (d3 * d4 < 0)
        for j in np.where(hit)[0]:
            if owner[j] != owner[i]: out.add(tuple(sorted((owner[i], owner[j]))))
    return sorted(out)
_cl = loop_clash()
if _cl: print('LOOP_CLASH', _cl, flush=True)
res = delaunay_2d_cdt([Vector(p) for p in pts], cons, [], 0, 1e-9)
vout, fout, orig_v = res[0], res[2], res[3]
assert len(vout) == len(pts), ('CDT added or merged vertices: constraint loops intersect', len(vout), len(pts))
out_of = {}
for oi, lst in enumerate(orig_v):
    for k in lst: out_of[k] = oi
dom_out = np.array([[v.x, v.y] for v in vout]); F = np.array([list(f) for f in fout])
cent = dom_out[F].mean(1); hole = np.zeros(len(F), bool)
for s in (-1, 1): hole |= in_poly(cent, dom_out[[out_of[k] for k in tags['eye%d_0' % s]]])
F = F[~hole]
skin_d = from_dom(dom_out); skin_p = radial_hit(skin_d); skin_n = grad_n(skin_p)
verts = [tuple(p) for p in skin_p]; vdir = list(skin_d); vnorm = list(skin_n)
faces = [tuple(f) for f in F]
bound = [out_of[k] for k in tags['bound']]
pd = np.array([[0, 1., 0]]); pp = radial_hit(pd); pole = len(verts)
verts.append(tuple(pp[0])); vdir.append(pd[0]); vnorm.append(grad_n(pp)[0])
for i in range(NB): faces.append((bound[i], bound[(i + 1) % NB], pole))
# eyelid roll: the hole edge tucks into the head behind the lens globe (no visible gap)
roll_info = {}
for s in (-1, 1):
    rim = [out_of[k] for k in tags['eye%d_0' % s]]
    E = np.array([s * EX, float(front_hit(s * EX, EZ)[0]), EZ]); i0 = len(verts); rr = []
    for k, vi in enumerate(rim):
        P = np.array(verts[vi]); n = np.array(vnorm[vi]); t = E - P; t = t - n * (t @ n); t /= np.linalg.norm(t)
        verts.append(tuple(P - .0045 * SW * n + .0016 * SW * t)); vdir.append(vdir[vi]); vnorm.append(unit(.30 * n + t)); rr.append(i0 + k)
    for k in range(NE):
        faces.append((rim[k], rim[(k + 1) % NE], rr[(k + 1) % NE], rr[k]))
    roll_info[s] = (rim, rr)
RIM_L = np.array([verts[i] for i in roll_info[1][0]])
vdir = unit(np.array(vdir)); vnorm = np.array(vnorm)
fuv = az_uv(vdir, AMAX); buv = azb_uv(vdir, BMAX)
face_uvs = []
for f in faces:
    a = math.acos(float(np.clip(-vdir[list(f)].mean(0)[1] / np.linalg.norm(vdir[list(f)].mean(0)), -1, 1)))
    if a < A_SPLIT: face_uvs.append(tuple(tuple(au('head', *fuv[i])) for i in f))
    else: face_uvs.append(tuple(tuple(au('headback', *buv[i])) for i in f))
skin = mesh('kero_head_skin', verts, faces, face_uvs, 'head', 'head', raw_uv=True, normals=vnorm)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)
# star-shape check: every skin vertex's analytic normal faces away from O (the radial projection never folds)
_vv = np.array(verts[:len(skin_p)]); LOG['skin_fold_vertices'] = int((((_vv - O) * skin_n).sum(1) < 0).sum())

# ============================================================== EYES: flush lens globes following the domes
ES = [0, .12, .25, .38, .51, .63, .74, .84, .92, .98, 1.10]
NSEG = 32
eye_centers = {}; eye_axes = {}
def eye_h(k): return (.0016 - .0042 * k * k) * SW
for s, tag in ((-1, 'R'), (1, 'L')):
    psi = np.linspace(0, 2 * PI, NSEG, endpoint=False)
    rows = []
    cx = s * EX; Sc = np.array([cx, float(front_hit(cx, EZ)[0]), EZ]); axis = grad_n(Sc[None])[0]
    for k in ES:
        if k == 0: x = np.array([cx]); z = np.array([EZ])
        else: x, z = eye_xz(s, psi, k)
        y = front_hit(x, z); S = np.stack([x, y, z], -1); n = grad_n(S)
        rows.append(S + n * eye_h(k))
    rim = rows[-1]
    for depth, sc in [(.010 * SW, .86), (.020 * SW, .58)]:
        rows.append(Sc + (rim - Sc) * sc - axis * depth)
    tip = Sc - axis * .026 * SW
    def euv(px, pz): return (.5 + (px - cx) / (2.4 * EHW), .5 + (pz - EZ) / (2.4 * EHH))
    V = [tuple(rows[0][0])]; UVs = [euv(cx, EZ)]
    for j, r in enumerate(rows[1:]):
        kk = min(j + 1, len(ES) - 1); x, z = eye_xz(s, psi, ES[kk])
        for i in range(NSEG): V.append(tuple(r[i])); UVs.append(euv(x[i], z[i]))
    V.append(tuple(tip)); UVs.append(UVs[-1])
    nr = len(rows) - 1; ix = lambda j, i: 1 + j * NSEG + i % NSEG
    fs = [(0, ix(0, i), ix(0, i + 1)) for i in range(NSEG)]
    for j in range(nr - 1):
        for i in range(NSEG): fs.append((ix(j, i), ix(j + 1, i), ix(j + 1, i + 1), ix(j, i + 1)))
    last = len(V) - 1
    for i in range(NSEG): fs.append((ix(nr - 1, i), last, ix(nr - 1, i + 1)))
    sharp_ring = [ix(len(ES) - 2, i) for i in range(NSEG)]
    mesh('eyeball.' + tag, V, fs, [tuple(UVs[k] for k in f) for f in fs], 'eye.' + tag, 'eye.' + tag, sharp=sharp_ring)
    eye_centers[tag] = [float(v) for v in (Sc - axis * .013 * SW)]; eye_axes[tag] = axis
    LOG['eye_axis_' + tag] = {'out_deg': round(math.degrees(math.atan2(s * axis[0], -axis[1])), 1),
                              'up_deg': round(math.degrees(math.asin(axis[2])), 1)}

# ============================================================== BODY: the pear torso (a lathe-profile implicit)
# z, half-width, front half-depth, back half-depth (metres; the sheet's front and side views, measure.md)
TOR = np.array([(.150, .200, .135, .110), (.175, .243, .190, .160), (.200, .262, .220, .200), (.230, .277, .242, .232),
                (.260, .287, .256, .251), (.300, .294, .267, .265), (.340, .293, .271, .270), (.380, .286, .268, .266),
                (.420, .274, .261, .256), (.460, .258, .248, .240), (.500, .238, .231, .220), (.540, .215, .209, .198),
                (.580, .193, .186, .176), (.640, .165, .160, .150)])
TOR_ZT = .640; TOR_YC = .000
def cr_interp(z, Z, Y):
    """Catmull-Rom (uniform-in-index) interpolation of a table, vectorised"""
    z = np.asarray(z, float); i = np.clip(np.searchsorted(Z, z) - 1, 0, len(Z) - 2); t = np.clip((z - Z[i]) / (Z[i + 1] - Z[i]), 0, 1)
    p0 = Y[np.maximum(i - 1, 0)]; p1 = Y[i]; p2 = Y[i + 1]; p3 = Y[np.minimum(i + 2, len(Z) - 1)]
    return .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
BOWL = ([0, TOR_YC, .330], [.300, .272, 2.0], (2.2, 2.2, 2.), 2.3, .195)   # the rounded base (lowest at z 0.135), open above
def torso_sdf(p):
    x, y, z = p[..., 0], p[..., 1] - TOR_YC, p[..., 2]
    zz = np.clip(z, .150, TOR_ZT)
    a = cr_interp(zz, TOR[:, 0], TOR[:, 1]); bf = cr_interp(zz, TOR[:, 0], TOR[:, 2]); bb = cr_interp(zz, TOR[:, 0], TOR[:, 3])
    b = np.where(y < 0, bf, bb); n = 2.25
    s_ = (np.abs(x / a) ** n + np.abs(y / b) ** n) ** (1 / n)
    d = (s_ - 1) * (a ** -4 + b ** -4) ** -.25          # smooth min (see skull_local)
    d = smax(d, sell(p, *BOWL), .060)
    return np.maximum(d, z - TOR_ZT)
TORSO_O = np.array([0, TOR_YC, .360])
# the belly: a big pale oval (front projection, metres): centre z 0.33, half-width 0.245, bottom 0.135, top 0.54 (under the scarf)
BELLY = dict(zc=.330, a=.245, hb=.195, ht=.210, n=2.0)
def belly_alpha(P, aa=.0035):
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    v = np.where(z >= BELLY['zc'], (z - BELLY['zc']) / BELLY['ht'], (BELLY['zc'] - z) / BELLY['hb'])
    s_ = (np.abs(x / BELLY['a']) ** BELLY['n'] + np.abs(v) ** BELLY['n']) ** (1 / BELLY['n'])
    d = (s_ - 1) * .20                       # roughly metres near the edge
    d = smax(d, y + .02, .03)                # front half only
    return 1 - smooth(-aa, aa, d)
def body_occ(p): return np.minimum(head_sdf(p), 9.)
def torso_shade(P, N): return sval(N, .30 * ao(body_occ, P, N, .05), hi=.16, lo=.24)
def build_torso():
    D, F = cube_sphere(9 if FAST else 15); D = unit(D * np.array([1., 1., 1.15]))
    P = ray_outer(torso_sdf, TORSO_O, D, t1=.6); N = grad(torso_sdf, P)
    dd = unit(P - TORSO_O); fu = az_uv(dd, AMAX); bu = azb_uv(dd, BMAX); UV = []
    for f in F:
        c = unit(dd[list(f)].mean(0)[None])[0]; a = math.acos(float(np.clip(-c[1], -1, 1)))
        UV.append([tuple(au('torso', *fu[i])) if a < A_SPLIT else tuple(au('torsoback', *bu[i])) for i in f])
    return make_obj('pear_torso', P, F, UV, 'body', N)
torso_ob = build_torso()

# ============================================================== SCARF: a soft thick roll, the knot's two ends, the lily pad
SC = dict(zc=.535, dz=.026, rx=.245, ry=.215, ry_b=.210, yc=-.018, hh=.046, ht_f=.055, ht_b=.045)
def build_scarf_band():
    NT, NS = 50 if not FAST else 40, 14
    th = np.linspace(0, 2 * PI, NT, endpoint=False)
    G = np.zeros((NT, NS, 3))
    for i, t in enumerate(th):
        ry = SC['ry'] if math.cos(t) > 0 else SC['ry_b']
        c = np.array([SC['rx'] * math.sin(t), SC['yc'] - ry * math.cos(t), SC['zc'] - SC['dz'] * math.cos(t)])
        out = unit(np.array([math.sin(t) / SC['rx'], -math.cos(t) / ry, 0.]))
        back = .5 - .5 * math.cos(t)                                           # 0 at the front, 1 at the back
        ht = SC['ht_f'] + (SC['ht_b'] - SC['ht_f']) * back
        hh = SC['hh'] * (1 + .05 * math.sin(3 * t + .4))                       # a little soft unevenness
        for k in range(NS):
            a = 2 * PI * k / NS; ca, sa = math.cos(a), math.sin(a)
            G[i, k] = c + out * (ht * float(spow(np.array(ca), .62))) + np.array([0, 0, hh * float(spow(np.array(sa), .72))])
    du = np.roll(G, -1, 0) - np.roll(G, 1, 0); dv = np.roll(G, -1, 1) - np.roll(G, 1, 1)
    Nn = unit(np.cross(du, dv))
    cen = np.array([0, SC['yc'], SC['zc']]); flip = ((Nn * (G - cen)).sum(-1) < 0).mean() > .5
    if flip: Nn = -Nn
    V = G.reshape(-1, 3); NV = Nn.reshape(-1, 3); F = []
    for i in range(NT):
        for k in range(NS):
            a_ = i * NS + k; b_ = ((i + 1) % NT) * NS + k; c_ = ((i + 1) % NT) * NS + (k + 1) % NS; d_ = i * NS + (k + 1) % NS
            F.append((a_, b_, c_, d_))
    val = sval(NV, .35 * ao(head_sdf, V, NV, .035), hi=.20, lo=.24)
    return make_obj('scarf_roll', V, F, ramp_uv('scarf', val), 'scarf', NV)
scarf_ob = build_scarf_band()
# the knot's two rounded ends: teardrops hanging from under the badge, splayed ~28 deg, lying on the belly
scarf_end_info = {}
def rot_x(t): return np.array([[1, 0, 0], [0, math.cos(t), -math.sin(t)], [0, math.sin(t), math.cos(t)]])
def rot_y(t): return np.array([[math.cos(t), 0, math.sin(t)], [0, 1, 0], [-math.sin(t), 0, math.cos(t)]])
for s, tag in ((-1, 'R'), (1, 'L')):
    Ce = np.array([s * .056, -.290, .424]); R = rot_y(math.radians(-30) * s) @ rot_x(math.radians(-30))
    rad = np.array([.066, .031, .078])
    def end_sdf(p, Ce=Ce, R=R, rad=rad):
        q = (p - Ce) @ R
        taper = 1 - .50 * smooth(-.3, 1., q[..., 2] / rad[2])                  # narrow toward the top (under the badge)
        q = np.stack([q[..., 0] / taper, q[..., 1] / (.75 + .25 * taper), q[..., 2]], -1)
        return sell(q, [0, 0, 0], rad, (2.3, 2.1, 2.2))
    def end_shade(P, N, Ce=Ce, R=R, rad=rad):
        q = (P - Ce) @ R                                                         # a soft centre fold from the top
        fold = np.exp(-(q[:, 0] / .007) ** 2) * smooth(-.25, .55, q[:, 2] / rad[2]) * (q[:, 1] < 0)
        return clamp(sval(N, .25 * ao(torso_sdf, P, N, .03), hi=.18, lo=.22) - .16 * fold)
    sdf_ball('scarf_end.' + tag, end_sdf, Ce, 6 if FAST else 9, 'scarf_end.' + tag, 'scarf', scale=(1, .45, 1.3), orient=R,
             shade=end_shade, t1=.15)
    scarf_end_info[tag] = dict(top=[float(v) for v in Ce + R @ np.array([0, 0, rad[2]])], tip=[float(v) for v in Ce - R @ np.array([0, 0, rad[2]])],
                               sdf=end_sdf)
# the lily-pad badge: a soft pillow disc with its notch (a narrow V from the rim almost to the centre, at 1 o'clock)
BADGE = dict(c=np.array([0, -.300, .515]), r=.058, t=.012, dome=.006, rim=.008, notch=math.radians(80), nhw=math.radians(9.5), apex=.16, tilt=14.)
def badge_R(th):
    d = np.angle(np.exp(1j * (th - BADGE['notch'])))
    v = np.clip(np.abs(d) / BADGE['nhw'], 0, 1); cut = (1 - v ** 2) ** .6
    return BADGE['r'] * (1 - (1 - BADGE['apex']) * cut)
def build_badge():
    NT_ = 54 if not FAST else 48
    tt = np.linspace(-1, 1, NT_, endpoint=False) + 1 / NT_                 # angular samples warped toward the notch
    th = np.mod(BADGE['notch'] + PI * np.sign(tt) * np.abs(tt) ** 1.6, 2 * PI); th = th[np.argsort(th)]
    Rm = badge_R(th)
    Rb = rot_x(math.radians(-BADGE['tilt']))                     # its face turns a little up
    ex = np.array([1., 0, 0]); ez = np.array([0, 0, 1.]); en = np.array([0, -1., 0])
    # profile rows: front centre -> front rim -> back rim -> back centre; (radial fraction offset, normal height)
    prof_ = []
    for k in range(5): prof_.append((k / 5 * (1 - BADGE['rim'] / BADGE['r']), BADGE['t'] + BADGE['dome'] * (1 - (k / 5) ** 2), 'f'))
    for k in range(7):                                            # the rounded rim: a half-round from front to back
        a = PI / 2 * (1 - k / 6 * 2)
        prof_.append(((1 - BADGE['rim'] / BADGE['r']) + BADGE['rim'] / BADGE['r'] * math.cos(a), BADGE['rim'] * math.sin(a) + (BADGE['t'] - BADGE['rim']) * (a > 0) * 0 + 0.0, 'r'))
    for k in range(3, -1, -1): prof_.append((k / 4 * (1 - BADGE['rim'] / BADGE['r']), -BADGE['t'] * .55, 'b'))
    V = []; rows = []
    for (fr, h, kind) in prof_:
        if kind == 'r': hh = h + (BADGE['t'] - BADGE['rim']) * (1 if h >= 0 else 0)
        else: hh = h
        if fr < 1e-9:
            rows.append([len(V)]); V.append(BADGE['c'] + Rb @ (en * hh)); continue
        row = []
        for i, t in enumerate(th):
            # the radial fraction scales the notched outline; near the centre the outline relaxes to a circle
            rr = fr * (Rm[i] + (BADGE['r'] - Rm[i]) * (1 - smooth(.15, .85, fr)) * 0)
            rr = min(rr, Rm[i] - (1 - fr) * 0) if fr < 1 else rr
            p = ex * (rr * math.cos(t)) + ez * (rr * math.sin(t)) + en * hh
            row.append(len(V)); V.append(BADGE['c'] + Rb @ p)
        rows.append(row)
    F = []
    for a_, b_ in zip(rows, rows[1:]):
        if len(a_) == 1:
            for i in range(NT_): F.append((a_[0], b_[i], b_[(i + 1) % NT_]))
        elif len(b_) == 1:
            for i in range(NT_): F.append((a_[i], b_[0], a_[(i + 1) % NT_]))
        else:
            for i in range(NT_): F.append((a_[i], b_[i], b_[(i + 1) % NT_], a_[(i + 1) % NT_]))
    V = np.array(V)
    ob = make_obj('lily_pad_badge', V, F, np.zeros((len(V), 2)), 'scarf')
    me = ob.data; me.update()
    # orient outward (from its centre) and shade it with the pad ramp: a lighter raised rim, darker toward the centre's dip
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    cen = Vector(BADGE['c'] + Rb @ (en * BADGE['t'] * .2))
    bad = sum(1 for f in bm.faces if (f.calc_center_median() - cen).dot(f.normal) < 0)
    if bad > len(bm.faces) / 2: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free(); me.update()
    vn = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('normal', vn); vn = vn.reshape(-1, 3)
    loc = (V - BADGE['c']) @ Rb; rad_ = np.hypot(loc[:, 0], loc[:, 2]) / BADGE['r']
    val = clamp(sval(vn, 0., hi=.20, lo=.22) + .12 * smooth(.78, .96, rad_) * (loc[:, 1] < 0) - .10 * (1 - smooth(.0, .5, rad_)) * (loc[:, 1] < 0))
    uvl = me.uv_layers['Atlas']; lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    uvl.data.foreach_set('uv', ramp_uv('pad', val)[lv].astype(np.float32).ravel())
    return ob
badge_ob = build_badge()

# ============================================================== ARMS + three-finger hands, LEGS + broad three-toed feet
joint_arms = {}; joint_legs = {}
ARM_DEG = 38.
def arm_parts(s):
    sh = np.array([s * .212, -.010, .505]); a = math.radians(ARM_DEG)
    d = unit(np.array([s * math.sin(a), -.07, -math.cos(a)]))
    root = sh - d * .060; elbow = sh + d * .118; wrist = sh + d * .200; palm = sh + d * .238
    across = unit(np.cross(d, np.array([0, -1., 0]))) * s          # in the frontal plane, pointing down-out -> up-out
    if across[2] < 0: across = -across
    thick = unit(np.cross(across, d))
    return sh, d, root, elbow, wrist, palm, across, thick
def make_arm_sdf(s):
    sh, d, root, elbow, wrist, palm, across, thick = arm_parts(s)
    Rh = np.stack([across, thick, d], 1)                            # columns: local x (width), y (thickness), z (along)
    def arm_sdf(p):
        tube = np.minimum(np.minimum(seg_dist(p, root, sh, .063, .062), seg_dist(p, sh, elbow, .062, .057)), seg_dist(p, elbow, wrist, .057, .053))
        q = (p - palm) @ Rh
        palm_ = sell(q, [0, 0, 0], [.064, .053, .056], (2.3, 2.2, 2.2))
        fing = None
        for k, (ox, oz, r) in enumerate(((-.041, .050, .029), (.000, .057, .031), (.041, .050, .029))):
            fk = sell(q, [ox, .002, oz], [r, r * .95, r * 1.25], (2.0, 2.0, 2.0))
            fing = fk if fing is None else np.minimum(fing, fk)
        hand = smin(palm_, fing, .017)
        return smin(tube, hand, .030)
    return arm_sdf
arm_sdfs = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    sh, d, root, elbow, wrist, palm, across, thick = arm_parts(s)
    f_ = make_arm_sdf(s); arm_sdfs[tag] = f_
    sdf_limb('arm.' + tag, f_, [root, sh, elbow, palm], 28 if not FAST else 16, 15 if not FAST else 10, 13 if not FAST else 6,
             'arm.' + tag, 'skin', occ_f=torso_sdf, occ_k=.30, ref=thick, t1=.3)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'hand': [float(v) for v in palm], 'finger_tip': [float(v) for v in palm + d * .09]}
FOOT = dict(splay=14.)
def leg_parts(s):
    hip = np.array([s * .160, -.004, .250]); knee = np.array([s * .162, -.008, .165]); ankle = np.array([s * .165, -.012, .098])
    fc = np.array([s * .205, -.040, .044])
    return hip, knee, ankle, fc
def make_leg_sdf(s):
    hip, knee, ankle, fc = leg_parts(s)
    Rf = rot_y(0) @ np.array([[math.cos(math.radians(FOOT['splay'] * s)), -math.sin(math.radians(FOOT['splay'] * s)), 0],
                             [math.sin(math.radians(FOOT['splay'] * s)), math.cos(math.radians(FOOT['splay'] * s)), 0], [0, 0, 1]])
    def leg_sdf(p):
        tube = np.minimum(seg_dist(p, hip + np.array([0, 0, .06]), knee, .086, .087), seg_dist(p, knee, ankle, .087, .086))          # the ankle sphere stays above the sole
        q = (p - fc) @ Rf                                            # foot frame: x out, y forward (-), z up
        pad = sell(q, [0, .020, 0], [.135, .140, .052], (2.4, 2.3, 2.0), pzlo=4.0, rzlo=.044)
        toes = None
        for k, (ox, oy, rx, rz) in enumerate(((-.082, -.112, .046, .040), (.000, -.135, .052, .043), (.084, -.110, .046, .040))):
            tk = sell(q, [ox, oy, -.004], [rx, .060, rz], (2.2, 2.2, 2.0), pzlo=3.5, rzlo=.040)
            toes = tk if toes is None else np.minimum(toes, tk)
        foot = smin(pad, toes, .016)
        return smax(smin(tube, foot, .045), -p[..., 2], .004)       # a flat sole on the ground (z 0)
    return leg_sdf
leg_sdfs = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    hip, knee, ankle, fc = leg_parts(s)
    f_ = make_leg_sdf(s); leg_sdfs[tag] = f_
    sdf_limb('leg.' + tag, f_, [hip + np.array([0, 0, .06]), hip, knee, ankle], 50 if not FAST else 36, 12 if not FAST else 8,
             15 if not FAST else 9, 'leg.' + tag, 'skin', occ_f=torso_sdf, occ_k=.25, ref=np.array([1., 0, 0]), t1=.35)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'foot': [float(v) for v in fc], 'toe': [float(fc[0] + s * .02), float(fc[1] - .17), .03]}

# hidden surface: the parts buried in the head / torso
LOG['culled_faces'] = {}
for g, f_, m_ in (('body', head_sdf, .008), ('scarf', head_sdf, .004), ('arm.L', torso_sdf, .012), ('arm.R', torso_sdf, .012),
                  ('leg.L', torso_sdf, .012), ('leg.R', torso_sdf, .012)):
    for ob in parts[g]: LOG['culled_faces'][ob.name] = cull_buried(ob, f_, m_)

# ============================================================== PAINTED ATLAS (2048, deterministic PNG)
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
def cr_path(P, k=8):
    P = np.asarray(P, float); n = len(P); out = []
    for i in range(n - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, n - 1)]
        for t in np.linspace(0, 1, k, endpoint=False):
            out.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1]); return np.array(out)
def lash_th(psi):
    """the upper lash band's thickness (eye units) round the eye: psi 0 = outer, pi/2 = top, pi = inner"""
    S = np.sin(np.clip(psi, 0, PI))
    outer = smooth(1.9, .5, psi)                                 # thicker toward the outer top
    return (.055 + .06 * S ** .7 + .12 * outer * smooth(-.5, .3, psi)) * (1 - smooth(2.55, 3.0, psi)) * smooth(-.55, -.10, psi)
def paint_head(d): return paint_head_P(radial_hit(d))
def paint_head_P(P):
    n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .03, HY - .07, y)
    occ = .22 * ao(lambda p: head_sdf(p), P, n, .02) * 0
    # round 2: the sheet's #8AD86A as the face's mid tone, its cool #6FBE55 in the turned-away areas and under the
    # jowls, a gentle light only on the domes' tops and the brow
    up = smooth(.45, .90, n[:, 2]) * smooth(.40, .56, zr)
    C = ramp_colour('skin', clamp(sval(n, 0., hi=0., lo=.26) + .07 * up))
    # soft painted shade under the jaw toward the neck; the domes' valley a touch deeper; a paler throat under the smile
    under = smooth(-.25, -.85, n[:, 2]) * (1 - smooth(.06, .22, zr))
    C = mix(C, rgb('skinshade'), .60 * under)
    valley = np.exp(-(q[:, 0] / .07) ** 2) * smooth(.50, .56, zr) * smooth(.30, .0, np.abs(q[:, 1] + .05))
    C = mix(C, rgb('skinshade'), .18 * valley)
    thr = fr * (1 - smooth(.10, .215, zr)) * smooth(.32, .16, np.abs(q[:, 0])) * smooth(-.4, .1, -n[:, 1])   # the pale chin under the smile: the centre front only
    C = mix(C, rgb('throat'), .85 * thr)
    # blush ovals
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .88 * (1 - smooth(.62, 1.10, r)) * fr)
    # nostrils: two small soft ovals, the outer ends a little higher
    nx_, nz_ = NOSTRIL
    for s in (-1, 1):
        dx = x - s * nx_; dz = z - nz_; c_, s_ = math.cos(math.radians(18) * s), math.sin(math.radians(18) * s)
        u = c_ * dx + s_ * dz; v = -s_ * dx + c_ * dz
        r = np.sqrt((u / (.0185 * W)) ** 2 + (v / (.0140 * W)) ** 2)
        C = mix(C, rgb('nostril'), (1 - smooth(.80, 1.15, r)) * fr)
    # the brows: soft arcs on the domes' fronts, tapering to rounded points
    for s in (-1, 1):
        Pb = cr_path(np.stack([-s * np.asarray([b[0] for b in BROW]) * W, CHIN + np.asarray([b[1] for b in BROW]) * W], -1), 8)
        tt = np.linspace(-1, 1, len(Pb)); half = .0145 * W * np.maximum(0, 1 - tt * tt) ** .55 + .0028 * W
        box = fr * ((np.abs(x - s * .289 * W) < .12 * W) & (np.abs(z - (CHIN + .590 * W)) < .07 * W))
        a = np.zeros(len(x)); ib = box > 0
        if ib.any(): a[ib] = stroke(x[ib], z[ib], Pb, half, .0030 * W)
        C = mix(C, rgb('brow'), .95 * a)
    # the smile: one clean wide line, a touch thicker at the corners, which curl up
    t_ = np.linspace(-1, 1, 121); Pm = mouth_curve(t_) * W; Pm[:, 1] += CHIN
    half = .0043 * W + .0022 * W * smooth(.75, 1., np.abs(t_))
    ib = (fr > 0) & (np.abs(x) < .30 * W) & (np.abs(z - (CHIN + .235 * W)) < .06 * W)
    a = np.zeros(len(x))
    if ib.any(): a[ib] = stroke(x[ib], z[ib], Pm, half, .0024 * W)
    lip = np.zeros(len(x))
    if ib.any():
        Pl = Pm.copy(); Pl[:, 1] -= .012 * W
        lip[ib] = stroke(x[ib], z[ib], Pl, np.full(len(Pl), .008 * W), .010 * W)
    C = mix(C, rgb('skinshade'), .22 * lip * (1 - a))
    C = mix(C, rgb('mouth'), .95 * a)
    # the upper lash line on the skin, round the top of each eye, and the outer wing
    for s in (-1, 1):
        sr, psi, X, Z = eye_s(s, x, z)
        near_eye = fr * (sr < 2.0)
        th_ = lash_th(psi)
        lash = (1 - smooth(1 + th_ - .018, 1 + th_ + .018, sr)) * (th_ > .004) * (sr > .90)
        bxk, bzk = eye_xz(s, np.array([.30]), 1.06)
        tt_ = np.linspace(0, 1, 9)
        Pf_ = np.stack([bxk[0] + s * .030 * W * tt_, bzk[0] + .004 * W * tt_ + .012 * W * tt_ ** 2], -1)
        hf = .0125 * W * (1 - tt_) ** .75 + .0016 * W
        ib = (near_eye > 0) & (np.abs(x - Pf_[:, 0].mean()) < .08 * W) & (np.abs(z - Pf_[:, 1].mean()) < .07 * W)
        aw = np.zeros(len(x))
        if ib.any(): aw[ib] = stroke(x[ib], z[ib], Pf_, hf, .0026 * W)
        C = mix(C, rgb('lash'), np.maximum(lash, aw * smooth(-.05, -.40, n[:, 1])) * near_eye * PAINT_OPTS['lash'])
    return C
def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    C = mix(rgb('sclera'), rgb('#ece2d6'), .55 * smooth(.30, .98, Z))
    C = mix(C, rgb('#efe6dc'), .30 * smooth(.3, 1., s * X))
    ix = -s * .50; iz = -.08; irx = .78; irz = .85
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#f0b04a'), rgb('iris'), smooth(-.95, -.45, ez))
    I = mix(I, rgb('#a8611b'), smooth(-.45, .25, ez))
    I = mix(I, rgb('#6a3a12'), smooth(.25, .85, ez))
    I = mix(I, rgb('#8a5216'), smooth(.84, 1.0, r) * .70)
    I = I * (1 - .03 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 24 + r * 8)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = -s * .55; pz = -.03; R = np.sqrt(((X - px_) / .50) ** 2 + ((Z - pz) / .64) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.985, 1.015, R))
    big = np.sqrt(((X - (-s * .54)) / .180) ** 2 + ((Z - .39) / .205) ** 2)
    small = np.sqrt(((X - (-s * .23)) / .150) ** 2 + ((Z + .32) / .150) ** 2)
    C = mix(C, rgb('#fffbf4'), np.maximum(1 - smooth(.90, 1.06, big), .95 * (1 - smooth(.86, 1.10, small))))
    C = mix(C, rgb('lash'), smooth(.965, 1.0, sr) * smooth(-.15, .45, Z))     # the lid contact under the lash band
    return C
def paint_torso_P(P):
    N = grad(torso_sdf, P); occ = .30 * ao(body_occ, P, N, .05)
    v = sval(N, occ, hi=.16, lo=.24)
    C = ramp_colour('skin', v)
    ba = belly_alpha(P)
    C = mix(C, ramp_colour('belly', clamp(v + .04)), ba)
    return C
def paint(chart, U, V):
    if chart == 'head': return paint_head(az_dir(U.ravel(), V.ravel(), AMAX)).reshape(U.shape + (3,))
    if chart == 'headback': return paint_head(azb_dir(U.ravel(), V.ravel(), BMAX)).reshape(U.shape + (3,))
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart == 'torso':
        d = az_dir(U.ravel(), V.ravel(), AMAX); return paint_torso_P(ray_outer(torso_sdf, TORSO_O, d, t1=.6)).reshape(U.shape + (3,))
    if chart == 'torsoback':
        d = azb_dir(U.ravel(), V.ravel(), BMAX); return paint_torso_P(ray_outer(torso_sdf, TORSO_O, d, t1=.6)).reshape(U.shape + (3,))
    if chart.startswith('lidU') or chart.startswith('lidD'): return np.broadcast_to(rgb('skin'), U.shape + (3,)).copy()   # painted by the rig
    if chart == 'cavity': return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue': return mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V))
    if chart == 'ramp':
        C = np.broadcast_to(rgb('skin'), U.shape + (3,)).copy()
        for name, row in RAMP_ROWS.items():
            m = (V * (CHARTS['ramp'][3]) >= row * 32) & (V * (CHARTS['ramp'][3]) < row * 32 + 32)
            C = np.where(m[..., None], ramp_colour(name, U), C)
        return C
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [138, 216, 106, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    if name == 'ramp':
        U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), np.arange(h) / h)
    else:
        U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name in ('head', 'headback', 'torso', 'torsoback'):
        block = np.empty((h, w, 3))
        for r0 in range(0, h, 128): block[r0:r0 + 128] = paint(name, U[r0:r0 + 128], V[r0:r0 + 128])
    else:
        block = paint(name, U, V)
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'kero-toy_rig_atlas.png') if RIG else os.path.join(ROOT, 'scratch' if FAST else '', 'kero-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Kero_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Kero_toy_atlas'); MAT.use_nodes = True
bs = MAT.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .12
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
sk = np.array([list(v.co) for v in skin.data.vertices])
def width_at(zw):
    zz = CHIN + zw * W; band_ = sk[np.abs(sk[:, 2] - zz) < .0035]
    return round(float(np.ptp(band_[:, 0]) / W / 2), 3) if len(band_) else None
def side_at(zw):
    zz = CHIN + zw * W; band_ = sk[np.abs(sk[:, 2] - zz) < .0035]
    return [round(float((band_[:, 1].min() - HY) / W), 3), round(float((band_[:, 1].max() - HY) / W), 3)] if len(band_) else None
def top_at(xw):
    b_ = sk[np.abs(sk[:, 0] - xw * W) < .004]
    return round(float((b_[:, 2].max() - CHIN) / W), 3) if len(b_) else None
allv = all_verts([o for g in parts.values() for o in g])
MEAS = {'W_m': W, 'chin_z_m': CHIN,
        'total_height_m': round(float(allv[:, 2].max()), 4), 'lowest_z_m': round(float(allv[:, 2].min()), 5),
        'width_m': round(float(np.ptp(allv[:, 0])), 4), 'depth_m': round(float(np.ptp(allv[:, 1])), 4),
        'head_width_W': round(float(np.ptp(sk[:, 0]) / W), 3),
        'dome_top_above_chin_W': round(float((sk[:, 2].max() - CHIN) / W), 3), 'dome_top_z_m': round(float(sk[:, 2].max()), 4),
        'head_depth_W': round(float(np.ptp(sk[:, 1]) / W), 3),
        'front_half_widths_W': {str(z): width_at(z) for z in (.06, .10, .15, .20, .25, .30, .35, .40, .45, .50, .55, .60, .63)},
        'top_outline_W': {str(x): top_at(x) for x in (0., .05, .09, .11, .13, .16, .20, .25, .30, .35, .40)},
        'side_front_back_W': {str(z): side_at(z) for z in (.02, .06, .10, .14, .18, .22, .26, .30, .34, .38, .42, .46, .50, .54, .58, .62)},
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'eye_hole_W': [round(float(np.ptp(RIM_L[:, 0]) / W), 3), round(float(np.ptp(RIM_L[:, 2]) / W), 3)]}
MEAS.update(LOG)

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
NAMES = {'head': 'Kero_head', 'eye.L': 'Kero_eye_L', 'eye.R': 'Kero_eye_R', 'body': 'Kero_body', 'scarf': 'Kero_scarf',
         'scarf_end.L': 'Kero_scarf_end_L', 'scarf_end.R': 'Kero_scarf_end_R', 'arm.L': 'Kero_arm_L', 'arm.R': 'Kero_arm_R',
         'leg.L': 'Kero_leg_L', 'leg.R': 'Kero_leg_R'}
for group in NAMES:
    if group not in parts: continue
    obs = parts[group]
    for ob in obs:
        ob.data.materials.clear(); ob.data.materials.append(MAT)
        if RIG:
            vg = ob.vertex_groups.new(name='_part_' + ob.name); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = NAMES[group]; ob.data.name = NAMES[group]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-8)
    bad = [f for f in bm.faces if f.calc_area() < 1e-12]
    if bad: bmesh.ops.delete(bm, geom=bad, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(ob.data); bm.free()
    for p in ob.data.polygons: p.material_index = 0; p.use_smooth = True
    if ob.data.attributes.get('cust_n') is not None:
        me = ob.data; a = me.attributes.get('cust_n')
        sn = np.zeros(len(me.vertices) * 3, np.float32); a.data.foreach_get('vector', sn); sn = sn.reshape(-1, 3)
        cn = np.zeros(len(me.loops) * 3, np.float32); me.corner_normals.foreach_get('vector', cn); cn = cn.reshape(-1, 3)
        lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
        use = np.linalg.norm(sn[lv], axis=1) > .5
        cn[use] = sn[lv][use]
        me.normals_split_custom_set([tuple(v) for v in cn]); me.attributes.remove(me.attributes['cust_n'])
    piv = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'],
           'scarf_end.L': scarf_end_info['L']['top'], 'scarf_end.R': scarf_end_info['R']['top'],
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip']}.get(group, (0, 0, 0))
    bpy.context.scene.cursor.location = piv; bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for v in ob.data.vertices: assert all(math.isfinite(c) for c in v.co), 'Nonfinite position'
    for p in ob.data.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['phase'] = '1: neutral A-pose, no armature'; ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    ob.data.calc_loop_triangles(); part_tri[group] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count

dome_c = {tag: [float(v) for v in L2M(np.array([s * DOME['x'], DOME['y'], DOME['z']]))] for s, tag in ((-1, 'R'), (1, 'L'))}
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X',
          'root': [0, 0, 0], 'hips': [0, -.004, .250], 'spine': [0, -.004, .340], 'chest': [0, -.006, .450], 'neck': [0, -.012, .560],
          'head_base': [0, float(HY * .5), CHIN + .02], 'head': [float(v) for v in O],
          'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .12 * W)],
          'mouth_corners': {'L': [float(MHW + .004 * W), float(front_hit(MHW, CHIN + .250 * W)[0]), float(CHIN + .250 * W)],
                            'R': [float(-MHW - .004 * W), float(front_hit(-MHW, CHIN + .250 * W)[0]), float(CHIN + .250 * W)]},
          'eyes': eye_centers, 'eye_domes': dome_c,
          'brows': {'L': [.289 * W, float(front_hit(.289 * W, CHIN + .605 * W)[0]), CHIN + .605 * W],
                    'R': [-.289 * W, float(front_hit(-.289 * W, CHIN + .605 * W)[0]), CHIN + .605 * W]},
          'arms': joint_arms, 'legs': joint_legs, 'scarf_ends': {k: {'top': v['top'], 'tip': v['tip']} for k, v in scarf_end_info.items()},
          'badge': [float(v) for v in BADGE['c']],
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of one smooth implicit (frog skull superquadric + snout swelling + two eye domes, smin), radially projected, analytic normals.',
                    'Eye holes are the full open eye, ringed by %d concentric loops each, rim rolled in behind separate lens eyeballs; 3 loops follow the smile.' % len(EYE_SCALES),
                    'Arms / legs: tube rows (bend loops) along the limb, the end cap projected onto the hand / foot; scarf ends separate objects; buried hidden surface deleted.']}
if not FAST and not RIG:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'kero-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('KERO_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
