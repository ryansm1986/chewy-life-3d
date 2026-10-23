"""Pan / Sleepy Playmate (Toybox villager, VL-1), Opus build, phase 1 (the model). Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_pan-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/pan-toy.glb (--fast: writes scratch/pan-fast.glb instead).

Technique (the Mochi / Kuma / Rosie toy-line machinery):
- The head is ONE smooth implicit ball: a wide superquadric (an elliptic top, a squarer bottom, round in plan, the face
  wrapping round so the eyes face ~30 deg out) with a gentle low muzzle swelling and a nose button smooth-unioned in.
  Its skin is the field's zero surface reached by radial projection (CDT in a stereographic domain with edge loops round
  both eyelid holes, the nose and the mouth), every vertex on the surface with the field's analytic normal: the face
  stays convex, no sockets. The eye patches, brows, nose, mouth and blush are painted on the ball from 3D positions.
- The eyes are separate flush lens globes in real lid holes; each has a separate upper lid shell (the sleepy rest
  pose: it covers the top ~30% of the iris) with a thick rounded lash ledge, pivoting on the eye centre for the rig.
- The ears are thick round discs (SDF blobs meshed by radial projection), the torso a smooth pear (a lathe-profile
  implicit), the feet, tail, scarf knot and scarf ends SDF blobs; arms and legs are tubes with bend loops; the scarf
  band a soft roll round the neck.
- One material, one 2048 painted atlas: the head charts painted from 3D positions, two eye charts, two lid charts, a
  nose chart and 1-D shading ramps (soft painted light baked into the colour, never hard shadows).
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FAST = '--fast' in ARGV
RIG = bool(globals().get('RIG_MODE'))      # set by rig_pan-toy.py: part labels, rig charts, the eye hole cut to the visible opening; no approved file written
MODEL = 'D:/projects/chewy-life-3d/public/models/pan-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'pan-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}

# >>> HEAD_SDF (pure numpy: scratch tools exec this block to fit the head)
# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround: ground y 535, ear tops y 83 -> 1.08 m (418.5 px / m); head close-up: W = 305 px at the cheeks, chin y 838.
W = .600; CHIN = .586; HY = .000          # head width at the cheeks, chin height, head centre y (metres)
SW = W / .44                              # Rosie's metric detail sizes (authored at W 0.44) scale by SW
PAL = {'fur': '#fbf8f4', 'furshade': '#e6dcd5', 'furlight': '#fffdf9', 'black': '#29262d', 'blackshade': '#1c1a20',
       'blacklight': '#4a4755', 'iris': '#c88a37', 'pupil': '#211d28', 'nose': '#211d28', 'scarf': '#ff7aba',
       'scarfshade': '#e8609f', 'scarflight': '#ff9ccb', 'blush': '#f2a1a2', 'mouth': '#3a2b30', 'lash': '#17151b',
       'brow': '#29262d', 'sclera': '#fff8f0'}
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

# ---------------------------------------------------------------- the head ball (W units, z above the chin)
# front widths fitted to the sheet (measure.md): an elliptic top (exponent ~2.05 over 0.518 W), a squarer bottom
# (~2.55 over 0.256 W), widest 0.256 W above the chin; depth 0.83 W (face front 0.41 W ahead of the centre)
HEAD = dict(A=.500, BF=.410, BB=.415, ZC=.256, HT=.518, HB=.256, nA_t=2.10, nA_b=2.55, nB_t=2.80, nB_b=4.0,
            n=2.0, nBb_t=2.25, nBb_b=1.9, egg=.20, nA_top=3.00, v_sq0=.473, v_sq1=.950, n_top=2.00)
# round 2: above z 0.50 the front outline's exponent ramps from 2.10 to 3.10 (z 0.50 -> 0.70): the wide, flat-topped
# squircle of the sheet (0.85 W at z 0.60, 0.73 W at 0.70, the crown flat across the middle); z <= 0.50 is unchanged
# the lower face's fullness: a smooth swelling of the front half's depth, centred low (no muzzle ellipsoid, so no
# outline under the mouth), narrower than the face
MUZ = dict(m=.110, z=.200, wz=.115, wx=.300)
def prof(z, m_t, m_b):
    zc = HEAD['ZC']; v = np.where(z >= zc, (z - zc) / HEAD['HT'], (zc - z) / HEAD['HB'])
    m = np.where(z >= zc, m_t, m_b); vv = np.clip(v, 0, 1)
    return np.maximum(np.clip(1 - vv ** m, 0, 1) ** (1 / m), 1e-4), v
def skull_local(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    _v = (z - HEAD['ZC']) / HEAD['HT']
    mA_t = HEAD['nA_t'] + (HEAD['nA_top'] - HEAD['nA_t']) * smooth(HEAD['v_sq0'], HEAD['v_sq1'], _v)
    gA, v = prof(z, mA_t, HEAD['nA_b']); gB, _ = prof(z, HEAD['nB_t'], HEAD['nB_b']); gBb, _ = prof(z, HEAD['nBb_t'], HEAD['nBb_b'])
    sw = 1 + MUZ['m'] * np.exp(-((z - MUZ['z']) / MUZ['wz']) ** 2) * np.exp(-(x / MUZ['wx']) ** 2)
    a = HEAD['A'] * gA; b = np.where(y < 0, HEAD['BF'] * gB * sw, HEAD['BB'] * gBb)
    # round 3: a plan-exponent ramp above z 0.50 was tried (1.75 pinched the sides into points) and left at 2.0: round
    # ellipses at every height (the side turns into the face and the back over ~0.2 W)
    n = HEAD['n'] + (HEAD['n_top'] - HEAD['n']) * smooth(HEAD['v_sq0'], HEAD['v_sq1'], _v)
    vv = np.clip(y / b, -1, 0); a = a * (1 - HEAD['egg'] * vv * vv)     # the face wraps round: eyes face ~30 deg out
    s = (np.abs(x / a) ** n + np.abs(y / b) ** n) ** (1 / n)
    d = (s - 1) * np.minimum(a, b)
    return np.where(v > 1, np.maximum(d, (v - 1) * np.where(z >= HEAD['ZC'], HEAD['HT'], HEAD['HB'])), d)
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
# the nose: a soft button on the muzzle (the sheet: 0.098 x 0.062 W, centre 0.264 W, tip 0.067 W ahead of the face)
NOSE_ZC = .264
_yn = float(front_local(0, NOSE_ZC, skull_local)[0])
NOSE = [[0, _yn + .030 - .040, NOSE_ZC], [.050, .030, .031]]; K_N = .016
def head_local(q): return smin(skull_local(q), ell(q, *NOSE), K_N)
_zt = np.linspace(.20, .32, 121); _ft = front_local(np.zeros_like(_zt), _zt, head_local)
NOSE_TIP_L = float(np.nanmin(_ft)); NOSE_TIP_Z = float(_zt[np.nanargmin(_ft)])
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
# <<< HEAD_SDF

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
def head_uv(d):
    a = np.arccos(np.clip(-d[:, 1], -1, 1)); psi = np.arctan2(d[:, 2], d[:, 0]); r = np.minimum(a / AMAX, 1) * .5
    return np.stack([.5 + r * np.cos(psi), .5 + r * np.sin(psi)], -1)
def head_uv_dir(U, V):
    du = U - .5; dv = V - .5; a = np.minimum(np.sqrt(du * du + dv * dv) * 2, 1) * AMAX; psi = np.arctan2(dv, du)
    return np.stack([np.sin(a) * np.cos(psi), -np.cos(a), np.sin(a) * np.sin(psi)], -1)
def headback_uv(d):
    b = np.arccos(np.clip(d[:, 1], -1, 1)); psi = np.arctan2(d[:, 2], -d[:, 0]); r = np.minimum(b / BMAX, 1) * .5
    return np.stack([.5 + r * np.cos(psi), .5 + r * np.sin(psi)], -1)
def headback_uv_dir(U, V):
    du = U - .5; dv = V - .5; b = np.minimum(np.sqrt(du * du + dv * dv) * 2, 1) * BMAX; psi = np.arctan2(dv, du)
    return np.stack([-np.sin(b) * np.cos(psi), np.cos(b), np.sin(b) * np.sin(psi)], -1)

# ---------------------------------------------------------------- atlas charts and shading ramps
# 2048 atlas charts (x, y, w, h) in pixels, y up (Blender UV convention)
CHARTS = {'head': (0, 768, 1280, 1280), 'headback': (1280, 1280, 768, 768),
          'eye.L': (1280, 896, 384, 384), 'eye.R': (1664, 896, 384, 384),
          'nose': (1280, 640, 256, 256), 'lid.L': (1536, 640, 256, 256), 'lid.R': (1792, 640, 256, 256),
          'ramp': (0, 0, 1024, 512)}
if RIG:   # phase 2: the rig's upper lids (bigger, for the shut lash ribbon), lower lids, the mouth cavity and the tongue
    CHARTS.update({'lidU.L': (0, 512, 640, 256), 'lidU.R': (640, 512, 640, 256), 'lidD.L': (1024, 0, 256, 256),
                   'lidD.R': (1280, 0, 256, 256), 'cavity': (1536, 0, 128, 128), 'tongue': (1664, 0, 128, 128)})
RAMPS = {'fur': ('furshade', 'fur', 'furlight'), 'black': ('blackshade', 'black', 'blacklight'),
         'scarf': ('scarfshade', 'scarf', 'scarflight')}
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
def sval(n, occ=0., hi=.30, lo=.26):
    """painted soft shading: 0.5 = base colour, lighter toward the key light, darker below / occluded"""
    d = np.asarray(n) @ LIGHT
    return clamp(.50 + hi * smooth(.0, .95, d) - lo * smooth(.05, .95, -d) - occ)

# ---------------------------------------------------------------- face layout (front projection, metres; sheet-measured)
# the eye hole is the FULL opening (the rig opens the lid wider); the lid's rest edge makes the sleepy shape
EX = .234 * W; EZ = CHIN + .315 * W; EHW = .097 * W; EHH = .080 * W; EN = 2.1
def lid_edge_Z(X):            # the upper lid's rest edge, eye units (X > 0 outer): covers the top ~30% of the iris
    return .30 - .08 * X - .04 * X * X
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi)
    return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
NZ = CHIN + NOSE_ZC * W; MC = CHIN + .184 * W; MHW = .088 * W
BROW_Z = CHIN + .546 * W; BROW_X = .207 * W
BLUSH = (.354 * W, CHIN + .171 * W, .085 * W, .052 * W)
PATCH = [(0.1006, 0.3412), (0.1032, 0.3180), (0.1097, 0.2957), (0.1203, 0.2753), (0.1355, 0.2583), (0.1562, 0.2477),
         (0.1766, 0.2406), (0.1919, 0.2277), (0.2081, 0.2130), (0.2280, 0.2042), (0.2497, 0.1989), (0.2729, 0.1949),
         (0.2977, 0.1935), (0.3238, 0.1959), (0.3497, 0.2037), (0.3729, 0.2181), (0.3913, 0.2384), (0.4033, 0.2630),
         (0.4079, 0.2899), (0.4052, 0.3166), (0.3975, 0.3412), (0.3873, 0.3630), (0.3760, 0.3823), (0.3637, 0.3993),
         (0.3506, 0.4145), (0.3370, 0.4285), (0.3228, 0.4419), (0.3073, 0.4542), (0.2898, 0.4644), (0.2705, 0.4723),
         (0.2497, 0.4804), (0.2264, 0.4886), (0.2011, 0.4910), (0.1761, 0.4858), (0.1532, 0.4741), (0.1343, 0.4566),
         (0.1201, 0.4355), (0.1103, 0.4123), (0.1042, 0.3885), (0.1010, 0.3648)]   # (x, z) W, his left; measure/m9.py

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
    """mesh the zero set of f by radial projection of a cube-sphere from centre (analytic normals, ramp UVs);
    orient (3x3, columns = world axes of the local frame) and scale shape the ray distribution"""
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
def limb(name, points, radius, group, rings=14, sides=16, cap_rows=6, cap_len=.9, ramp='black', occ_f=None, squash=1.0, occ_k=.35):
    """a tube along a Catmull-Rom centreline with even bend loops; buried start fan; rounded (mitten) end cap"""
    V = []; NV = []; rows = []
    old = None
    def frame(t):
        p = catmull(points, t); d = unit(catmull(points, min(1, t + .002)) - catmull(points, max(0, t - .002)))
        return p, d
    for j in range(rings + 1):
        t = j / rings; p, d = frame(t)
        ref = np.array([0, 1., 0]) if abs(d[1]) < .95 else np.array([1., 0, 0])
        x = unit(np.cross(d, ref)) if old is None else unit(old - d * (old @ d)); y = np.cross(d, x); old = x
        r = radius(t); row = []
        for i in range(sides):
            a = 2 * PI * i / sides; q = p + x * (r * math.cos(a)) + y * (r * squash * math.sin(a))
            row.append(len(V)); V.append(q); NV.append(unit(x * math.cos(a) * squash + y * math.sin(a)))
        rows.append(row)
    p, d = frame(1.0); r = radius(1.0)
    for k in range(1, cap_rows):
        a = k / cap_rows * PI / 2; c = p + d * (r * cap_len * math.sin(a)); row = []
        for i in range(sides):
            b = 2 * PI * i / sides; q = c + (x * math.cos(b) + y * squash * math.sin(b)) * (r * math.cos(a))
            row.append(len(V)); V.append(q)
            NV.append(unit((x * math.cos(b) * squash + y * math.sin(b)) * math.cos(a) / max(squash, .5) + d * math.sin(a) / cap_len))
        rows.append(row)
    tip = len(V); V.append(p + d * r * cap_len); NV.append(d)
    p0, d0 = frame(0.); st = len(V); V.append(p0 - d0 * radius(0.) * .3); NV.append(-d0)
    F = []
    for a_, b_ in zip(rows, rows[1:]):
        for i in range(sides): F.append((a_[i], a_[(i + 1) % sides], b_[(i + 1) % sides], b_[i]))
    for i in range(sides): F.append((rows[-1][i], rows[-1][(i + 1) % sides], tip))
    for i in range(sides): F.append((rows[0][(i + 1) % sides], rows[0][i], st))
    V = np.array(V); NV = np.array(NV)
    occ = occ_k * ao(occ_f, V, NV) if occ_f is not None else 0.
    return make_obj(name, V, F, ramp_uv(ramp, sval(NV, occ)), group, NV), V
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
    # keep the custom-normal attribute aligned: bmesh carries point attributes through
    bm.to_mesh(me); bm.free(); me.update()
    return len(kill)

# ============================================================== HEAD SKIN: CDT on the ball, eyelid / nose / mouth loops
pts = []; cons = []; tags = {}
def add_loop(P, tag, closed=True):
    i0 = len(pts); pts.extend([tuple(p) for p in P]); n = len(P)
    for i in range(n if closed else n - 1): cons.append((i0 + i, i0 + (i + 1) % n))
    tags[tag] = list(range(i0, i0 + n)); return tags[tag]
def surf_dir(x, z):
    y = front_hit(x, z); return unit(np.stack([np.asarray(x, float) * np.ones_like(y), y, np.asarray(z, float) * np.ones_like(y)], -1) - O)

NE = 44
EYE_SCALES = [1.0, 1.07, 1.15, 1.24, 1.34, 1.45]
eye_dom = {}
for s in (-1, 1):
    psi = np.linspace(0, 2 * PI, NE, endpoint=False)
    x, z = eye_xz(s, psi); base = to_dom(surf_dir(x, z)); c = to_dom(surf_dir(np.array([s * EX]), np.array([EZ])))[0]
    eye_dom[s] = (c, base)
    wn = (1 - .45 * smooth(-.10, -.80, np.cos(psi))) * (1 - .30 * smooth(-.2, -.9, np.sin(psi)))   # tighter toward the nose / mouth
    if not RIG:
        for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
    else:
        # RIG: loop 0 = the visible opening (the eye's outline under the rest lid edge, the corners softly rounded), two
        # loops blending it out to the 1.07 ring, then the approved rings from 1.07 on
        Xo, Zo = eye_unit(psi); Zc = np.minimum(Zo, lid_edge_Z(Xo) + .02 * (1 - np.abs(Xo)) ** 2)
        Zc = np.where(Zo > Zc, Zc - .05 * smooth(.80, 1.0, np.abs(Xo)) * (Zo - Zc) / np.maximum(Zo - Zc, 1e-9), Zc)
        xc, zc = s * EX + s * EHW * Xo, EZ + EHH * np.minimum(Zo, Zc)
        clip_ = to_dom(surf_dir(xc, zc)); r107 = c + (base - c) * (1 + .07 * wn[:, None])
        add_loop(clip_, 'eye%d_0' % s)
        for k, f_ in ((1, .40), (2, .72)): add_loop(clip_ + (r107 - clip_) * f_, 'eye%d_x%d' % (s, k))
        for k, kk in enumerate(EYE_SCALES[1:]): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k + 1))
pts.append(tuple(to_dom(surf_dir(np.array([0.]), np.array([NZ])))[0])); tags['nose_c'] = [len(pts) - 1]
NOSE_LOOPS = [(.010, 12), (.020, 18), (.030, 26), (.040, 34), (.050, 40), (.058, 46)]   # fine rings over the button
_nc = np.array(pts[tags['nose_c'][0]])
for k, (rr, n) in enumerate(NOSE_LOOPS):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    _ref = to_dom(surf_dir(rr * W * np.cos(a), NZ + rr * W * np.sin(a)))
    rd = float(np.median(np.linalg.norm(_ref - _nc, axis=1)))
    if k: rd = max(rd, _rd_prev * 1.15)
    _rd_prev = rd
    add_loop(_nc + rd * np.stack([np.cos(a), np.sin(a)], -1), 'nose_%d' % k)
MOUTH_LOOPS = [(.110, .010, .022), (.122, .013, .030), (.134, .016, .038)]
for k, (hx, ht, hb) in enumerate(MOUTH_LOOPS):
    a = np.linspace(0, 2 * PI, 40, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MC + np.where(np.sin(a) > 0, ht, hb) * W * np.sin(a))), 'mouth_%d' % k)
NB = 12; AB = math.radians(176)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
# fill: a dense Fibonacci set of directions thinned to a spacing field (fine on the eyes / brows / nose / mouth band,
# medium on the face and crown, coarser on the back), deterministic greedy order
NF = 60000; ii = np.arange(NF) + .5
phi = np.arccos(1 - 2 * ii / NF); th = PI * (1 + 5 ** .5) * ii
D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1)); D = D[alpha < math.radians(173.5)]
Pf = radial_hit(D); q = M2L(Pf)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1))
band = smooth(.52, .42, np.abs(q[:, 0])) * smooth(.04, .12, q[:, 2]) * smooth(.66, .58, q[:, 2]) * smooth(math.radians(80), math.radians(66), alpha)
hsp = (.0170 + (.0280 - .0170) * smooth(math.radians(100), math.radians(125), alpha)) * (1.4 if FAST else 1.)
hsp = hsp * (1 - band) + .0092 * band * (1.4 if FAST else 1.)
order = np.argsort(-band * 2 + np.arange(len(D)) / len(D), kind='stable')   # the band first, then Fibonacci order
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
def eye_ring_rr(dp):
    best = np.full(len(dp), 9.)
    for s in (-1, 1):
        c, base = eye_dom[s]
        outer = np.array([pts[i] for i in tags['eye%d_%d' % (s, len(EYE_SCALES) - 1)]])
        ang_b = np.arctan2(outer[:, 1] - c[1], outer[:, 0] - c[0]); rad_b = np.linalg.norm(outer - c, axis=1)
        order_ = np.argsort(ang_b); ab = np.concatenate([ang_b[order_] - 2 * PI, ang_b[order_], ang_b[order_] + 2 * PI]); rb = np.tile(rad_b[order_], 3)
        v = dp - c; best = np.minimum(best, np.linalg.norm(v, axis=1) / np.interp(np.arctan2(v[:, 1], v[:, 0]), ab, rb))
    return best
keep = eye_ring_rr(dom) > 1.06
frontp = Pf[:, 1] < HY
_nr = np.linalg.norm(dom - _nc, axis=1)
keep &= ~(frontp & (_nr < _rd_prev * 1.10))
mz = (Pf[:, 2] - MC) / W
keep &= ~(frontp & ((Pf[:, 0] / (.146 * W)) ** 2 + (mz / np.where(mz > 0, .024, .050)) ** 2 < 1))
keep &= np.arccos(np.clip(-D[:, 1], -1, 1)) < math.radians(173.0)
fill0 = len(pts); pts.extend([tuple(p) for p in dom[keep]])
LOG['skin_fill_points'] = int(keep.sum())
def in_poly(P, poly):
    x = P[:, 0]; y = P[:, 1]; inside = np.zeros(len(P), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        inside ^= ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1)
    return inside
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
fuv = head_uv(vdir); buv = headback_uv(vdir)
face_uvs = []
NOSE_CH = .075          # the nose button gets its own front-projected chart (half-size in W)
_VA = np.array(verts); _nose_v = (_VA[:, 1] < HY) & (np.hypot(_VA[:, 0] / W, (_VA[:, 2] - NZ) / W) < .066)
def nose_uv(i): return tuple(au('nose', .5 + _VA[i, 0] / (2 * NOSE_CH * W), .5 + (_VA[i, 2] - NZ) / (2 * NOSE_CH * W)))
LOG['nose_chart_faces'] = 0
for f in faces:
    a = math.acos(float(np.clip(-vdir[list(f)].mean(0)[1] / np.linalg.norm(vdir[list(f)].mean(0)), -1, 1)))
    if all(_nose_v[i] for i in f):
        face_uvs.append(tuple(nose_uv(i) for i in f)); LOG['nose_chart_faces'] += 1
    elif a < A_SPLIT: face_uvs.append(tuple(tuple(au('head', *fuv[i])) for i in f))
    else: face_uvs.append(tuple(tuple(au('headback', *buv[i])) for i in f))
skin = mesh('pan_head_skin', verts, faces, face_uvs, 'head', 'head', raw_uv=True, normals=vnorm)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)

# ============================================================== EYES: flush lens globes following the ball
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
        h_ = eye_h(k)
        if RIG and k > 0:
            Xe = s * (x - s * EX) / EHW; Ze = (z - EZ) / EHH
            sink = smooth(lid_edge_Z(Xe) - .06, lid_edge_Z(Xe) + .04, Ze)
            h_ = h_ * (1 - sink) - .0032 * sink
        rows.append(S + n * np.asarray(h_)[..., None] if np.ndim(h_) else S + n * h_)
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
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}

# ============================================================== UPPER LIDS: the sleepy rest lid with a thick lash ledge
# a shell lying just over the lens, from its rest edge up past the hole's rim (tucked under the skin there), its edge a
# rounded ledge 0.010 W thick (<= 0.015 W proud of the skin); the rig rotates it on the eye centre
LID = dict(gap=.0006, t0=.0068, t1=.0026, kmax=1.13, NU=36, NV=12, NL=8)
def eye_pt(s, X, Z):
    """eye units (X > 0 outer) -> skin point, its normal"""
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S = np.stack([x, y, z], -1); return S, grad_n(S)
def ztop(X, k):
    return np.clip(k ** EN - np.abs(X) ** EN, 0, None) ** (1 / EN)
def lid_ends(k):
    out = []
    for sgn in (-1, 1):
        lo, hi = 0., k
        for _ in range(50):
            m = (lo + hi) / 2
            if ztop(sgn * m, k) > lid_edge_Z(sgn * m): lo = m
            else: hi = m
        out.append(sgn * (lo + hi) / 2)
    return out
lid_info = {}; LID_REST = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    Xa, Xb = lid_ends(LID['kmax'])
    uu = np.linspace(0, 1, LID['NU'] + 1); uu = .5 - .5 * np.cos(PI * uu)          # denser toward the corners
    Xs = Xa + (Xb - Xa) * uu; Ze = lid_edge_Z(Xs); Zt = np.maximum(ztop(Xs, LID['kmax']), Ze)
    ke = (np.abs(Xs) ** EN + np.abs(Ze) ** EN) ** (1 / EN)
    fade = 1 - smooth(.93, 1.05, ke)                                               # the ledge sinks out of sight at the corners
    S0, n0 = eye_pt(s, Xs, Ze); S1, _ = eye_pt(s, Xs, Ze + .03)
    dv = S1 - S0; dv = unit(dv - n0 * (dv * n0).sum(1, keepdims=True))             # along the lid, edge -> top
    grid_ = []; vcoord = []; gridN = []
    t0 = LID['t0'] * fade
    def base_off(k):        # away from the ledge the lid IS the skin's surface (same normals: no visible cap), just
        eps = .0003 - .0045 * smooth(1.0, 1.12, k)          # clear of the lens, and it dives under the skin past the rim
        return smax(eye_h(k) + LID['gap'] + .0005, eps, .0008)
    top0 = eye_h(ke) + LID['gap'] + t0
    for j in range(LID['NL']):                                                      # the ledge: a half-round, bottom -> top
        ph = PI * (1 - j / (LID['NL'] - 1))
        off = eye_h(ke) + LID['gap'] + t0 * (.5 + .5 * math.cos(ph)); sh = -(.55 * t0) * math.sin(ph)
        grid_.append(S0 + n0 * off[:, None] + dv * sh[:, None]); vcoord.append(.12 * j / (LID['NL'] - 1))
        gridN.append(np.zeros_like(S0))                                             # mesh normals on the ledge
    for j in range(1, LID['NV'] + 1):                                               # the lid surface, edge -> under the skin
        v = j / LID['NV']; Z = Ze + v * (Zt - Ze); k = (np.abs(Xs) ** EN + np.abs(Z) ** EN) ** (1 / EN)
        S, n = eye_pt(s, Xs, Z)
        bo = base_off(k); w_ = 1 - smooth(0, .42, v)
        off = np.maximum(bo + (top0 - bo) * w_, eye_h(k) + LID['gap'])
        grid_.append(S + n * off[:, None]); vcoord.append(.12 + .88 * v)
        gridN.append(n if v >= .5 else np.zeros_like(n))                            # the skin's own normals once flush
    G = np.array(grid_); nrow, ncol = G.shape[0], G.shape[1]; GN = np.array(gridN).reshape(-1, 3)
    V = G.reshape(-1, 3); Fs = []; UV = []
    uvc = lambda j, i: tuple(au('lid.' + tag, uu[i], vcoord[j]))
    for j in range(nrow - 1):
        for i in range(ncol - 1):
            Fs.append((j * ncol + i, j * ncol + i + 1, (j + 1) * ncol + i + 1, (j + 1) * ncol + i))
            UV.append([uvc(j, i), uvc(j, i + 1), uvc(j + 1, i + 1), uvc(j + 1, i)])
    ob = make_obj('upper_lid.' + tag, V, Fs, UV, 'lid.' + tag, N=GN) if not RIG else None
    if RIG:   # the approved lash ledge and its slope down to the skin stay on the head (static); the rig adds the moving lid
        js_ = [j for j in range(nrow) if j < LID['NL'] or vcoord[j] <= .12 + .88 * .42 + 1e-6]; nr_ = len(js_)
        Vl = G[js_].reshape(-1, 3); Fl = []; UVl = []
        for jj in range(nr_ - 1):
            for i in range(ncol - 1):
                j0, j1 = js_[jj], js_[jj + 1]
                Fl.append((jj * ncol + i, jj * ncol + i + 1, (jj + 1) * ncol + i + 1, (jj + 1) * ncol + i))
                UVl.append([uvc(j0, i), uvc(j0, i + 1), uvc(j1, i + 1), uvc(j1, i)])
        ol = make_obj('lash_ledge.' + tag, Vl, Fl, UVl, 'head')
        me_ = ol.data; me_.update(); cn_ = np.array(eye_centers[tag])
        pn_ = np.zeros(3 * len(me_.polygons)); me_.polygons.foreach_get('normal', pn_); pn_ = pn_.reshape(-1, 3)
        pc_ = np.zeros(3 * len(me_.polygons)); me_.polygons.foreach_get('center', pc_); pc_ = pc_.reshape(-1, 3)
        if ((pn_ * (pc_ - cn_)).sum(1) < 0).mean() > .5:
            bm = bmesh.new(); bm.from_mesh(me_); bmesh.ops.reverse_faces(bm, faces=bm.faces[:]); bm.to_mesh(me_); bm.free()
    # outward normals (away from the eye centre)
    if ob is not None:
        me = ob.data; me.update()
        cn = np.array(eye_centers[tag]); pn = np.zeros(3 * len(me.polygons)); me.polygons.foreach_get('normal', pn); pn = pn.reshape(-1, 3)
        pc = np.zeros(3 * len(me.polygons)); me.polygons.foreach_get('center', pc); pc = pc.reshape(-1, 3)
        if ((pn * (pc - cn)).sum(1) < 0).mean() > .5:
            bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.reverse_faces(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    LID_REST[tag] = dict(G=G.copy(), uu=uu.copy(), vcoord=list(vcoord), Xs=Xs.copy(), Ze=Ze.copy(), t0=t0.copy(), NL=LID['NL'])   # for the rig
    lid_info[tag] = dict(Xa=float(Xa), Xb=float(Xb), edge_proud_m=float((eye_h(ke) + LID['gap'] + t0).max()))
    # round 2: the lash wing. The ledge carries on past the outer corner, lying on the patch, and ends in a small upward
    # flick (a tapered tube that starts inside the ledge, so the join is hidden); part of the lid, so it moves with it
    NW_, SIDES_ = 16, 12
    uw = np.linspace(0, 1, NW_ + 1)
    Xw = .86 + .46 * uw; Xc = np.minimum(Xw, 1.)
    Zw = lid_edge_Z(Xc) - .08 * np.maximum(0, Xw - 1) + 1.55 * np.maximum(0, Xw - 1) ** 2 + .03
    Sw, nw = eye_pt(s, Xw, Zw); kw = (np.abs(Xw) ** EN + np.abs(Zw) ** EN) ** (1 / EN)
    rw = .5 * LID['t0'] * (1 - uw ** 1.7) ** .65 + .0005
    offw = np.maximum(rw * .55, eye_h(kw) + LID['gap'] + rw)
    Cw = Sw + nw * offw[:, None]
    Vw = []; Fw = []; UVw = []
    for i in range(NW_ + 1):
        tng = unit(Cw[min(i + 1, NW_)] - Cw[max(i - 1, 0)]); bx = unit(np.cross(nw[i], tng)); by = np.cross(tng, bx)
        for k in range(SIDES_):
            a_ = 2 * PI * k / SIDES_; Vw.append(Cw[i] + (bx * math.cos(a_) * .9 + by * math.sin(a_)) * rw[i])
    tip_ = len(Vw); Vw.append(Cw[-1] + unit(Cw[-1] - Cw[-2]) * rw[-1])
    uvw = tuple(au('lid.' + tag, 1., .05)) if not RIG else tuple(ramp_uv('black', .02))
    for i in range(NW_):
        for k in range(SIDES_):
            a_, b_ = i * SIDES_ + k, i * SIDES_ + (k + 1) % SIDES_
            Fw.append((a_, b_, b_ + SIDES_, a_ + SIDES_)); UVw.append([uvw] * 4)
    for k in range(SIDES_):
        Fw.append((NW_ * SIDES_ + k, NW_ * SIDES_ + (k + 1) % SIDES_, tip_)); UVw.append([uvw] * 3)
    make_obj('lash_wing.' + tag, np.array(Vw), Fw, UVw, 'lid.' + tag if not RIG else 'head')
LOG['lids'] = lid_info

# ============================================================== EARS: thick round discs on the crown's corners
EAR = dict(x=.380, y=.015, z=.718, r=.130, t=.098, p=(2.15, 2.2, 2.15), yaw=20., up=8., roll=14.)
ear_info = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    C = L2M(np.array([s * EAR['x'], EAR['y'], EAR['z']]))
    yw = math.radians(EAR['yaw']); ne = unit(np.array([s * math.sin(yw), -math.cos(yw), math.tan(math.radians(EAR['up']))]))
    up = np.array([0, 0, 1.]); up = unit(up - ne * (up @ ne)); tt = np.cross(up, ne)
    rl = math.radians(EAR['roll']) * s                      # the tops lean outward
    up, tt = unit(up * math.cos(rl) + tt * math.sin(rl)), unit(tt * math.cos(rl) - up * math.sin(rl))
    R = np.stack([tt, ne, up], 1)                           # columns: local x (lateral), y (thickness, front), z (up)
    rad = np.array([EAR['r'], EAR['t'], EAR['r']]) * W
    def ear_sdf(p, C=C, R=R, rad=rad):
        q = (p - C) @ R; return sell(q, [0, 0, 0], rad, EAR['p'])
    ob, P_, N_ = sdf_ball('ear.' + tag, ear_sdf, C, 6 if FAST else 11, 'ear.' + tag, 'black', scale=(1, .5, 1), orient=R, occ_f=head_sdf, occ_k=.30)
    ear_info[s] = dict(C=C, R=R, sdf=ear_sdf, n=ne)
    base_ = C.copy()
    for _ in range(30):                                     # the base point: the head surface below the ear centre
        if head_sdf(base_[None])[0] < 0: break
        base_ = base_ - unit(C - L2M(np.array([0, 0, .30]))) * .004
    ear_info[s]['base'] = base_
def ears_sdf(p): return np.minimum(ear_info[1]['sdf'](p), ear_info[-1]['sdf'](p))

# ============================================================== BODY: the pear torso (a lathe-profile implicit)
# z, half-width, front half-depth, back half-depth (metres; the sheet's front and side views, measure.md)
TOR = np.array([(.150, .150, .120, .110), (.205, .196, .158, .136), (.240, .215, .178, .155), (.280, .229, .197, .176),
                (.320, .232, .206, .188), (.360, .225, .208, .191), (.400, .210, .203, .185), (.440, .193, .193, .175),
                (.480, .177, .181, .162), (.520, .163, .168, .149), (.560, .150, .153, .136), (.600, .135, .138, .122),
                (.660, .118, .122, .108)])
TOR_Z0, TOR_ZB, TOR_ZT = .150, .158, .660         # the rounded base (z TOR_Z0 at its lowest), and the hidden neck top
TOR_YC = -.008
def cr_interp(z, Z, Y):
    """Catmull-Rom (uniform-in-index) interpolation of a table, vectorised"""
    z = np.asarray(z, float); i = np.clip(np.searchsorted(Z, z) - 1, 0, len(Z) - 2); t = np.clip((z - Z[i]) / (Z[i + 1] - Z[i]), 0, 1)
    p0 = Y[np.maximum(i - 1, 0)]; p1 = Y[i]; p2 = Y[i + 1]; p3 = Y[np.minimum(i + 2, len(Z) - 1)]
    return .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
BOWL = ([0, TOR_YC + .006, .340], [.272, .232, 2.0], (2.2, 2.2, 2.), 2.2, .190)   # the rounded base: a bowl (lowest at z 0.150), open above
def torso_sdf(p):
    x, y, z = p[..., 0], p[..., 1] - TOR_YC, p[..., 2]
    zz = np.clip(z, .150, TOR_ZT)                     # the pear's sections, narrowing into the bowl base
    a = cr_interp(zz, TOR[:, 0], TOR[:, 1]); bf = cr_interp(zz, TOR[:, 0], TOR[:, 2]); bb = cr_interp(zz, TOR[:, 0], TOR[:, 3])
    b = np.where(y < 0, bf, bb); n = 2.3
    s_ = (np.abs(x / a) ** n + np.abs(y / b) ** n) ** (1 / n)
    d = (s_ - 1) * np.minimum(a, b)
    d = smax(d, sell(p, *BOWL), .060)
    return np.maximum(d, z - TOR_ZT)
TORSO_O = np.array([0, TOR_YC, .380])
def body_occ(p): return np.minimum(head_sdf(p), 9.)
def torso_shade(P, N): return sval(N, .30 * ao(body_occ, P, N, .05), hi=.16, lo=.24)
def build_torso():
    D, F = cube_sphere(9 if FAST else 17); D = unit(D * np.array([1., 1., 1.25]))
    P = ray_outer(torso_sdf, TORSO_O, D, t1=.6); N = grad(torso_sdf, P)
    return make_obj('pear_torso', P, F, ramp_uv('fur', torso_shade(P, N)), 'body', N)
torso_ob = build_torso()
TAIL = ([0, .200, .262], [.054, .050, .054])
def tail_sdf(p): return ell(p, *TAIL)
tail_ob, _, _ = sdf_ball('round_tail', tail_sdf, np.array(TAIL[0]), 6 if FAST else 7, 'tail', 'fur', occ_f=torso_sdf)

# ============================================================== SCARF: a soft thick roll, a round front knot, two ends
SC = dict(zc=.576, rx=.174, ry=.152, yc=-.004, hh=.030, ht_f=.029, ht_b=.024)
def build_scarf_band():
    NT, NS = 56 if not FAST else 40, 14
    th = np.linspace(0, 2 * PI, NT, endpoint=False)
    G = np.zeros((NT, NS, 3)); Nn = np.zeros((NT, NS, 3))
    for i, t in enumerate(th):
        c = np.array([SC['rx'] * math.sin(t), SC['yc'] - SC['ry'] * math.cos(t), SC['zc'] - .004 * math.cos(t)])
        out = unit(np.array([math.sin(t) / SC['rx'], -math.cos(t) / SC['ry'], 0.]))
        back = .5 - .5 * math.cos(t)                                           # 0 at the front, 1 at the back
        ht = SC['ht_f'] + (SC['ht_b'] - SC['ht_f']) * back
        hh = SC['hh'] * (1 + .05 * math.sin(3 * t + .4))                       # a little soft unevenness
        for k in range(NS):
            a = 2 * PI * k / NS; ca, sa = math.cos(a), math.sin(a)
            G[i, k] = c + out * (ht * float(spow(np.array(ca), .80))) + np.array([0, 0, hh * float(spow(np.array(sa), .85))])
    # normals from the grid (periodic both ways)
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
KNOT_C = np.array([0, -.172, .560]); KNOT_R = [.050, .036, .043]
def knot_sdf(p): return sell(p, KNOT_C, KNOT_R, (2.2, 2.0, 2.2))
sdf_ball('scarf_knot', knot_sdf, KNOT_C, 6 if FAST else 9, 'scarf', 'scarf', occ_f=head_sdf, t1=.12)
scarf_end_info = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    Ce = np.array([s * .040, -.196, .497]); rl = math.radians(24) * s; tl = math.radians(-6)
    Rz = np.array([[math.cos(rl), 0, -math.sin(rl)], [0, 1, 0], [math.sin(rl), 0, math.cos(rl)]])   # roll about y
    Rx = np.array([[1, 0, 0], [0, math.cos(tl), -math.sin(tl)], [0, math.sin(tl), math.cos(tl)]])   # tilt: the end hangs forward
    R = Rx @ Rz
    rad = np.array([.040, .017, .064])
    def end_sdf(p, Ce=Ce, R=R, rad=rad):
        q = (p - Ce) @ R
        taper = 1 + .30 * np.clip(-q[..., 2] / rad[2], -1, 1)                  # wider at the bottom (a bow's tail)
        q = np.stack([q[..., 0] / taper, q[..., 1], q[..., 2]], -1)
        return sell(q, [0, 0, 0], rad, (2.6, 2.1, 2.4))
    sdf_ball('scarf_end.' + tag, end_sdf, Ce, 6 if FAST else 9, 'scarf_end.' + tag, 'scarf', scale=(1, .45, 1.4), orient=R, occ_f=knot_sdf, occ_k=.25, t1=.15)
    scarf_end_info[tag] = dict(top=[float(v) for v in Ce + R @ np.array([0, 0, rad[2]])], tip=[float(v) for v in Ce - R @ np.array([0, 0, rad[2]])])

# ============================================================== ARMS (A-pose 30 deg), LEGS and the big feet
joint_arms = {}; joint_legs = {}
ARM_DEG = 30.
for s, tag in ((-1, 'R'), (1, 'L')):
    sh = np.array([s * .152, -.012, .518]); a = math.radians(ARM_DEG)
    dvec = unit(np.array([s * math.sin(a), -.05, -math.cos(a)]))
    root = sh - dvec * .045; elbow = sh + dvec * .144; wrist = sh + dvec * .260
    rad = lambda t: .054 - .003 * float(smooth(.15, .55, t)) + .010 * float(smooth(.62, 1., t))
    limb('arm.' + tag, [root, sh, elbow, wrist], rad, 'arm.' + tag, rings=18, sides=18, cap_rows=7, cap_len=1.05,
         occ_f=torso_sdf, squash=1.24)
    joint_arms[tag] = {'shoulder': [float(v) for v in sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'paw_tip': [float(v) for v in wrist + dvec * rad(1.) * 1.05]}
FOOT = dict(r=[.112, .134, .058], p=(2.2, 2.1, 2.0), pzlo=3.4, rzlo=.046)
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * .115, -.004, .245]); knee = np.array([s * .117, -.008, .165]); ankle = np.array([s * .121, -.014, .080])
    limb('leg.' + tag, [hip + np.array([0, 0, .05]), hip, knee, ankle], lambda t: .086, 'leg.' + tag,
         rings=10, sides=18, cap_rows=3, cap_len=.5, occ_f=torso_sdf, squash=1.07)
    fc = np.array([s * .132, -.032, .046])
    def foot_sdf(p, fc=fc): return sell(p, fc, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
    sdf_ball('big_foot.' + tag, foot_sdf, fc + np.array([0, 0, .01]), 7 if FAST else 9, 'leg.' + tag, 'black', t1=.4,
             occ_f=lambda p: np.minimum(torso_sdf(p), 9.), occ_k=.2)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .12), .035]}

# hidden surface: the parts buried in the head / torso
LOG['culled_faces'] = {}
for g, f_, m_ in (('ear.L', head_sdf, .006), ('ear.R', head_sdf, .006), ('body', head_sdf, .008), ('scarf', head_sdf, .004),
                  ('tail', torso_sdf, .006), ('arm.L', torso_sdf, .012), ('arm.R', torso_sdf, .012),
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
def poly_sd(x, z, poly):
    """signed distance to a closed polygon (negative inside), vectorised"""
    P = np.asarray(poly, float); n = len(P); best = np.full(len(x), 9.)
    inside = np.zeros(len(x), bool)
    for i in range(n):
        a = P[i]; b = P[(i + 1) % n]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        best = np.minimum(best, np.hypot(x - (a[0] + t * ab[0]), z - (a[1] + t * ab[1])))
        inside ^= ((a[1] > z) != (b[1] > z)) & (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1] + 1e-30) + a[0])
    return np.where(inside, -best, best)
def closed_cr(P, k=6):
    P = np.asarray(P, float); n = len(P); out = []
    for i in range(n):
        p0, p1, p2, p3 = P[(i - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]
        for t in np.linspace(0, 1, k, endpoint=False):
            out.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return np.array(out)
PATCH_L = closed_cr(PATCH); PATCH_R = PATCH_L * np.array([-1, 1])
def patch_alpha(q, aa=.0030):
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    d = np.minimum(poly_sd(x, z, PATCH_L), poly_sd(x, z, PATCH_R))
    d = smax(d, y - .02, .03)                                       # front half only
    return 1 - smooth(-aa, aa, d)
def paint_head(d): return paint_head_P(radial_hit(d))
def paint_head_P(P):
    n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .03, HY - .07, y)
    C = np.broadcast_to(rgb('fur'), (len(x), 3)).copy()
    # soft painted shade: under the jaw toward the neck, the jaw's sides, the ear bases (warm grey, never hard)
    under = smooth(-.25, -.85, n[:, 2]) * (1 - smooth(.08, .24, zr))
    C = mix(C, rgb('furshade'), .80 * under)
    jaw = smooth(.45, .90, np.abs(n[:, 0])) * (1 - smooth(.14, .44, zr))
    C = mix(C, rgb('furshade'), .45 * jaw)
    back = smooth(.05, .30, y / W) * (1 - smooth(.10, .40, zr))
    C = mix(C, rgb('furshade'), .35 * back)
    for s in (-1, 1):
        dd = np.linalg.norm(P - ear_info[s]['base'], axis=1)
        C = mix(C, rgb('furshade'), .45 * np.exp(-(dd / (.10 * W)) ** 2))
    # the eye patches: clean rounded teardrops, true black with a soft cool light on their upper part
    pa = patch_alpha(q)
    Cb = mix(rgb('black'), rgb('#363341'), .55 * smooth(.30, .47, zr) * smooth(.0, .5, n[:, 2] + .3))
    C = mix(C, Cb, pa)
    # nose: a rounded inverted triangle with a soft highlight
    nx = x / W; nzz = (z - CHIN) / W
    tri = poly_sd(nx, nzz, [(-.0350, .2760), (.0350, .2760), (0, .2500)]) - .0140
    a_n = (1 - smooth(-.0018, .0018, tri)) * fr * (nzz > .19)
    Cn = mix(rgb('nose'), rgb('#4a4654'), .55 * np.exp(-(((nx + .014) / .013) ** 2 + ((nzz - .286) / .0070) ** 2)))
    C = mix(C, Cn, a_n)
    # blush ovals
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .85 * (1 - smooth(.50, 1.05, r)) * fr * (1 - pa))
    # brows: short soft beans set high on the white, the inner ends a little higher (sleepy-sweet)
    t = np.linspace(-1, 1, 17)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * .052 * W * t, BROW_Z + .020 * W * (1 - t * t) - .008 * W * t - .006 * W], -1)
        half = .0095 * W * np.maximum(0, 1 - t * t) ** .40 + .0032 * W
        box = fr * ((np.abs(x - s * BROW_X) < .10 * W) & (np.abs(z - BROW_Z) < .06 * W))
        a = np.zeros(len(x)); ib = box > 0
        a[ib] = stroke(x[ib], z[ib], Pb, half, .0028 * W)
        C = mix(C, rgb('brow'), .97 * a * fr)
    # mouth: a small "w" (corners curl up, two dips, a soft point in the middle) and a short line up to the nose
    t = np.linspace(-1, 1, 49); at = np.abs(t)
    zm = np.where(at > .5, .175 + .024 * ((at - .5) / .5) ** 2, .175 + .010 * (1 - at / .5) ** 2)
    Pm = np.stack([MHW * t, CHIN + zm * W], -1)
    half = .0058 * W - .0020 * W * at ** 3
    ib = (fr > 0) & (np.abs(x) < .13 * W) & (np.abs(z - (CHIN + .19 * W)) < .07 * W)
    a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0024 * W)
    Pp = np.array([[0, CHIN + .236 * W], [0, CHIN + .187 * W]])
    a2 = np.zeros(len(x)); a2[ib] = stroke(x[ib], z[ib], Pp, np.array([.0042 * W, .0048 * W]), .0024 * W)
    C = mix(C, rgb('mouth'), .95 * np.maximum(a, a2))
    # the lip puffs' soft shade just above the mouth line (painted, no geometry: no shelf)
    for s in (-1, 1):
        r = np.sqrt(((x - s * .046 * W) / (.040 * W)) ** 2 + ((z - (CHIN + .196 * W)) / (.018 * W)) ** 2)
        C = mix(C, rgb('#eee6e0'), .40 * (1 - smooth(.6, 1.2, r)) * fr * (1 - a))
    return C

def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .25; iz = -.04; irx = .711; irz = .862          # the iris: 0.138 W round, tucked toward the nose
    C = mix(rgb('sclera'), rgb('#e9e0e2'), .50 * smooth(.20, .95, Z))
    C = mix(C, rgb('#ece5e8'), .30 * smooth(.3, 1., s * X))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#dda24e'), rgb('iris'), smooth(-.90, -.25, ez))
    I = mix(I, rgb('#8c5a22'), smooth(-.30, .45, ez))
    I = mix(I, rgb('#6a4218'), smooth(.45, .95, ez))
    I = mix(I, rgb('#5e3a16'), smooth(.82, 1.0, r) * .75)
    I = I * (1 - .03 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 24 + r * 8)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix - s * .03; pz = .00; R = np.sqrt(((X - px_) / (.77 * irx)) ** 2 + ((Z - pz) / (.77 * irz)) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.985, 1.015, R))
    big = np.sqrt(((X - (-s * .62)) / .135) ** 2 + ((Z - .10) / .162) ** 2)
    small = np.sqrt(((X - (-s * .06)) / .060) ** 2 + ((Z + .44) / .072) ** 2)
    C = mix(C, rgb('#fffbf6'), np.maximum(1 - smooth(.90, 1.08, big), .9 * (1 - smooth(.85, 1.12, small))))
    C = mix(C, rgb('black'), smooth(.94, 1.0, sr))            # the lid contact at the rim
    return C
def paint_lid(U, V):
    """U along the edge (0 nasal end .. 1 outer end), V: 0 the ledge's underside -> .12 its top -> 1 under the skin"""
    C = mix(rgb('lash'), rgb('black'), smooth(.13, .36, V))
    C = mix(C, rgb('#3e3a48'), .55 * np.exp(-((V - .095) / .022) ** 2))      # a soft cool light on the ledge's top
    C = mix(C, rgb('#100e13'), .55 * (1 - smooth(.0, .05, V)))              # its underside
    return C
def paint(chart, U, V):
    if chart == 'head': return paint_head(head_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'headback': return paint_head(headback_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart in ('lid.L', 'lid.R'): return paint_lid(U, V)
    if chart.startswith('lidU') or chart.startswith('lidD'): return np.broadcast_to(rgb('black'), U.shape + (3,)).copy()   # painted by the rig
    if chart == 'cavity': return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue': return mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V))
    if chart == 'nose':     # front-projected: each texel painted at its true surface point
        x = (U.ravel() - .5) * 2 * NOSE_CH * W; z = NZ + (V.ravel() - .5) * 2 * NOSE_CH * W
        P = np.stack([x, front_hit(x, z), z], -1); return paint_head_P(P).reshape(U.shape + (3,))
    if chart == 'ramp':
        C = np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()
        for name, row in RAMP_ROWS.items():
            m = (V * (CHARTS['ramp'][3]) >= row * 32) & (V * (CHARTS['ramp'][3]) < row * 32 + 32)
            C = np.where(m[..., None], ramp_colour(name, U), C)
        return C
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = [251, 248, 244, 255]
for name, (x0, y0, w, h) in CHARTS.items():
    if name == 'ramp':
        U, V = np.meshgrid(clamp((np.arange(w) - 8) / (w - 16)), np.arange(h) / h)
    else:
        U, V = np.meshgrid(clamp((np.arange(w) - 6) / (w - 12)), clamp((np.arange(h) - 6) / (h - 12)))
    if name in ('head', 'headback'):
        block = np.empty((h, w, 3))
        for r0 in range(0, h, 128): block[r0:r0 + 128] = paint(name, U[r0:r0 + 128], V[r0:r0 + 128])
    else:
        block = paint(name, U, V)
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'pan-toy_rig_atlas.png') if RIG else os.path.join(ROOT, 'scratch' if FAST else '', 'pan-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Pan_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Pan_toy_atlas'); MAT.use_nodes = True
bs = MAT.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
sk = np.array([list(v.co) for v in skin.data.vertices])
def width_at(zw):
    """the head skin's front silhouette width at z (W above the chin), W units"""
    zz = CHIN + zw * W; band_ = sk[np.abs(sk[:, 2] - zz) < .0035]
    return round(float(np.ptp(band_[:, 0]) / W), 3) if len(band_) else None
def side_at(zw):
    zz = CHIN + zw * W; band_ = sk[np.abs(sk[:, 2] - zz) < .0035]
    return [round(float((band_[:, 1].min() - HY) / W), 3), round(float((band_[:, 1].max() - HY) / W), 3)] if len(band_) else None
earv = all_verts(parts['ear.L'] + parts['ear.R'])
allv = all_verts([o for g in parts.values() for o in g])
MEAS = {'W_m': W, 'chin_z_m': CHIN,
        'total_height_m': round(float(allv[:, 2].max()), 4), 'lowest_z_m': round(float(allv[:, 2].min()), 5),
        'head_width_W': round(float(np.ptp(sk[:, 0]) / W), 3),
        'crown_above_chin_W': round(float((sk[:, 2].max() - CHIN) / W), 3), 'crown_z_m': round(float(sk[:, 2].max()), 4),
        'head_depth_W': round(float(np.ptp(sk[:, 1]) / W), 3),
        'front_widths_W': {str(z): width_at(z) for z in (.06, .10, .14, .18, .22, .26, .30, .34, .38, .42, .46, .50, .60, .70, .74)},
        'side_front_back_W': {str(z): side_at(z) for z in (.02, .06, .10, .14, .18, .22, .26, .30, .38, .46, .50, .58, .66)},
        'ear_tip_z_m': round(float(earv[:, 2].max()), 4), 'ear_outer_x_W': round(float(np.abs(earv[:, 0]).max() / W), 3),
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'eye_hole_W': [round(float(np.ptp(RIM_L[:, 0]) / W), 3), round(float(np.ptp(RIM_L[:, 2]) / W), 3)],
        'nose_tip_z_W': round(NOSE_TIP_Z, 3), 'nose_proud_of_face_W': round(float(front_local(0, .36, head_local)[0] - NOSE_TIP_L), 3)}
MEAS.update(LOG)

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
NAMES = {'head': 'Pan_head', 'eye.L': 'Pan_eye_L', 'eye.R': 'Pan_eye_R', 'lid.L': 'Pan_lid_L', 'lid.R': 'Pan_lid_R',
         'ear.L': 'Pan_ear_L', 'ear.R': 'Pan_ear_R', 'body': 'Pan_body', 'scarf': 'Pan_scarf',
         'scarf_end.L': 'Pan_scarf_end_L', 'scarf_end.R': 'Pan_scarf_end_R', 'arm.L': 'Pan_arm_L', 'arm.R': 'Pan_arm_R',
         'leg.L': 'Pan_leg_L', 'leg.R': 'Pan_leg_R', 'tail': 'Pan_tail'}
for group in NAMES:
    if group not in parts: continue                      # (RIG: the rig builds the lids)
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
    if not group.startswith('lid'): bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
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
    piv = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'], 'lid.L': eye_centers['L'], 'lid.R': eye_centers['R'],
           'ear.L': tuple(ear_info[1]['base']), 'ear.R': tuple(ear_info[-1]['base']),
           'scarf_end.L': scarf_end_info['L']['top'], 'scarf_end.R': scarf_end_info['R']['top'],
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'], 'tail': tuple(TAIL[0])}.get(group, (0, 0, 0))
    bpy.context.scene.cursor.location = piv; bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for v in ob.data.vertices: assert all(math.isfinite(c) for c in v.co), 'Nonfinite position'
    for p in ob.data.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['phase'] = '1: neutral A-pose, no armature'; ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    ob.data.calc_loop_triangles(); part_tri[group] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count

ears_j = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    ei = ear_info[s]
    ears_j[tag] = {'base': [float(v) for v in ei['base']], 'centre': [float(v) for v in ei['C']],
                   'tip': [float(v) for v in ei['C'] + ei['R'][:, 2] * EAR['r'] * W]}
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X',
          'root': [0, 0, 0], 'hips': [0, -.004, .250], 'spine': [0, -.006, .330], 'chest': [0, -.008, .440], 'neck': [0, -.004, .560],
          'head_base': [0, .000, CHIN + .02], 'head': [float(v) for v in O],
          'jaw_pivot': [0, float(HY - .16 * W), float(CHIN + .13 * W)],
          'mouth_corners': {'L': [float(MHW + .004 * W), float(front_hit(MHW, MC)[0]), float(CHIN + .198 * W)],
                            'R': [float(-MHW - .004 * W), float(front_hit(-MHW, MC)[0]), float(CHIN + .198 * W)]},
          'eyes': eye_centers, 'upper_lids': {'L': eye_centers['L'], 'R': eye_centers['R'], 'rest_edge_Z_eye_units': 'lid_edge_Z(X) = .30 - .08 X - .04 X^2'},
          'brows': {'L': [BROW_X, float(front_hit(BROW_X, BROW_Z)[0]), BROW_Z], 'R': [-BROW_X, float(front_hit(-BROW_X, BROW_Z)[0]), BROW_Z]},
          'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs, 'tail': [float(v) for v in TAIL[0]],
          'scarf_ends': scarf_end_info,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth implicit ball (superquadric + low muzzle swelling + nose button), radially projected, analytic normals.',
                    'Eyelid holes are the FULL eye opening, ringed by %d concentric loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth, %d round the nose.' % (len(EYE_SCALES), len(NOSE_LOOPS)),
                    'Pan_lid_L/R: the sleepy rest upper lid (a shell over the lens with a thick lash ledge), origin at the eye centre.',
                    'Ears, scarf ends and tail are separate objects; buried hidden surface is deleted.']}
if not FAST and not RIG:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'pan-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('PAN_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
