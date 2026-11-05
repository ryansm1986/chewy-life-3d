"""Grandma Sasa / Grove Elder (Toybox zone villager, VL-2, Takemori Village), Opus build, phase 1 (the model).
Blender 4.3, no addons. Deterministic.

    blender --background --factory-startup --python build_tk-sasa-toy.py [-- --fast]

1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus
public/models/tk-sasa-toy.glb (--fast: writes scratch/sasa-fast.glb instead).

Technique (the Pan / Mochi / Kuma / Rosie toy-line machinery, Pan's build as the base):
- The head is ONE smooth implicit ball: a wide superquadric (an elliptic top flattening into a soft squircle crown, a
  rounder bottom, round in plan, the face wrapping round so the eyes face ~30 deg out) with a short low muzzle swelling
  and a nose button smooth-unioned in. Its skin is the field's zero surface reached by radial projection (CDT in a
  stereographic domain with edge loops round both eyelid holes, the nose and the mouth), every vertex on the surface
  with the field's analytic normal: the face stays convex, no sockets. The drooping eye patches, the lash wedges, brows,
  nose, mouth and blush are painted on the ball from 3D positions.
- The eyes are separate flush lens globes in real lid holes (the full opening). Each has a separate upper lid shell
  resting at the top of the opening: its thick rounded edge is the lash line (it catches a soft cool light so it reads
  on the dark patch), with a tapered wing past the outer corner; it pivots on the eye centre for the rig.
- The ears are thick round discs (SDF blobs, radial projection). The costume: a kimono torso (lathe implicit, painted
  crossed-collar creases), a thick two-roll obi, a pleated skirt (lathe with broad rounded box pleats and a rolled hem),
  wide short kimono sleeves with rolled cuffs, the kerchief (a soft band on the shoulders, a round knot, two leaf ends),
  black arms and legs as tubes with bend loops, big black feet and a round cream tail (SDF blobs).
- One material, one 2048 painted atlas: the head charts painted from 3D positions, two eye charts, two lid charts, a
  nose chart, a kimono chart and 1-D shading ramps (soft painted light baked into the colour, never hard shadows).
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FAST = '--fast' in ARGV
RIG = bool(globals().get('RIG_MODE'))      # set by a later rig script: part labels, rig charts, the eye hole cut to the visible opening; no approved file written
MODEL = 'D:/projects/chewy-life-3d/public/models/tk-sasa-toy.glb'
OUT_MODEL = os.path.join(ROOT, 'scratch', 'sasa-fast.glb') if FAST else MODEL
os.makedirs(os.path.join(ROOT, 'scratch'), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {}

# >>> HEAD_SDF (pure numpy: scratch tools exec this block to fit the head)
# ---------------------------------------------------------------- the sheet's measures (measure.md)
# turnaround: ground y 552.5, ear tops y 95.5 -> 1.00 m (457 px / m); W = 249 px = 0.545 m; head close-up: W = 287 px
# at the cheeks (y 753), crown y 599, chin y 833 (fitted: the kerchief hides it), features centred on x 189.3
W = .545; CHIN = .529; HY = .000          # head width at the cheeks, chin height, head centre y (metres)
SW = W / .44                              # Rosie's metric detail sizes (authored at W 0.44) scale by SW
PAL = {'fur': '#fbf8f2', 'furshade': '#e6ddd2', 'furlight': '#fffcf6', 'black': '#2c2830', 'blackshade': '#1e1b22',
       'blacklight': '#4a4552', 'iris': '#8a6a3a', 'pupil': '#1e1712', 'nose': '#2a2428', 'blush': '#f0a0a4',
       'mouth': '#2e2226', 'lash': '#151216', 'brow': '#4a3c3c', 'sclera': '#fff8ef',
       'kimono': '#7aa874', 'kimonoshade': '#5f8c5c', 'kimonolight': '#8ab481',
       'obi': '#e8c870', 'obishade': '#c9a24e', 'obilight': '#f6dc8c',
       'skirt': '#5a6e50', 'skirtshade': '#42523c', 'skirtlight': '#6f8462',   # round 2: lighter (the game's grade crushes dark greens)
       'kerchief': '#efe4cf', 'kerchiefshade': '#d6c7aa', 'kerchieflight': '#fbf3e2'}
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
# front widths fitted to the sheet (measure.md, measure/fit_head.py): widest 1.00 W at z 0.26-0.30, a rounder bottom
# (exponent 2.2 over 0.28 W down to the hidden chin), an elliptic top (1.78 over 0.535 W) easing into a soft squircle
# crown above v 0.62 (2.3); depth 0.87 W (the face front 0.437 W ahead of the centre), the back fuller up high and
# tucked in at the nape
HEAD = dict(A=.500, BF=.437, BB=.435, ZC=.280, HT=.535, HB=.280, nA_t=1.78, nA_b=2.20, nB_t=2.80, nB_b=4.0,
            n=2.0, nBb_t=2.50, nBb_b=1.55, egg=.20, nA_top=2.30, v_sq0=.620, v_sq1=.980, n_top=2.00)
# the short muzzle: a smooth swelling of the front half's depth, centred low (no muzzle ellipsoid, so no outline or
# shelf round it), narrower than the face; the side view's nose tip 0.534 W ahead of the head centre
MUZ = dict(m=.180, z=.250, wz=.100, wx=.170)
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
# the nose: a soft button on the muzzle (the sheet: 0.110 x 0.070 W, centre z 0.306 W)
NOSE_ZC = .306
_yn = float(front_local(0, NOSE_ZC, skull_local)[0])
NOSE = [[0, _yn + .026 - .036, NOSE_ZC], [.046, .026, .031]]; K_N = .016   # round 2: smaller and rounder (0.09 W)
def head_local(q): return smin(skull_local(q), ell(q, *NOSE), K_N)
_zt = np.linspace(.20, .38, 181); _ft = front_local(np.zeros_like(_zt), _zt, head_local)
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
          'nose': (1280, 640, 256, 256), 'kimono': (1024, 256, 1024, 384),
          'ramp': (0, 0, 1024, 512)}
if RIG:   # phase 2: the rig's upper lids, lower lids, the mouth cavity and the tongue (rows 0-256 and 512-768 kept free)
    CHARTS.update({'lidU.L': (0, 512, 512, 256), 'lidU.R': (512, 512, 512, 256), 'lidD.L': (1024, 0, 256, 256),
                   'lidD.R': (1280, 0, 256, 256), 'cavity': (1536, 0, 128, 128), 'tongue': (1664, 0, 128, 128)})
RAMPS = {'fur': ('furshade', 'fur', 'furlight'), 'black': ('blackshade', 'black', 'blacklight'),
         'kimono': ('kimonoshade', 'kimono', 'kimonolight'), 'obi': ('obishade', 'obi', 'obilight'),
         'skirt': ('skirtshade', 'skirt', 'skirtlight'), 'kerchief': ('kerchiefshade', 'kerchief', 'kerchieflight'),
         'lash': ('lash', 'lash', '#38323e')}
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
# the eye hole is the full opening (sclera + iris, measured inside the patch); the lash ribbon lines its upper rim
EX = .220 * W; EZ = CHIN + .389 * W; EHW = .089 * W; EHH = .075 * W; EN = 2.1
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi)
    return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
NZ = CHIN + NOSE_ZC * W; MC = CHIN + .248 * W; MHW = .096 * W
BROW_Z = CHIN + .617 * W; BROW_X = .212 * W
BLUSH = (.349 * W, CHIN + .240 * W, .076 * W, .058 * W)
PATCH = [(0.1007, 0.4120), (0.1024, 0.3847), (0.1118, 0.3590), (0.1296, 0.3384), (0.1502, 0.3224), (0.1703, 0.3079),
         (0.1915, 0.2953), (0.2146, 0.2852), (0.2398, 0.2766), (0.2679, 0.2708), (0.2984, 0.2707), (0.3301, 0.2769),
         (0.3588, 0.2931), (0.3799, 0.3185), (0.3890, 0.3503), (0.3862, 0.3829), (0.3768, 0.4120), (0.3645, 0.4368),
         (0.3562, 0.4602), (0.3380, 0.4776), (0.3243, 0.4965), (0.3089, 0.5154), (0.2902, 0.5337), (0.2672, 0.5493),
         (0.2398, 0.5614), (0.2091, 0.5664), (0.1785, 0.5601), (0.1506, 0.5456), (0.1287, 0.5232), (0.1141, 0.4961),
         (0.1053, 0.4678), (0.1013, 0.4396)]   # (x, z) W, her left; the sheet's two patches symmetrised (measure/m3_eyes.py)
# the lash: a centreline in eye units (X > 0 outer), from the inner end over the top of the opening and out into the
# wing (the sheet: tip at x 0.364 W, z 0.451 W); half-width along the skin in EHH units
LASH_CTRL = [(-.90, .56), (-.62, .86), (-.22, 1.00), (.20, 1.00), (.56, .92), (.86, .78), (1.08, .77), (1.26, .80), (1.40, .85)]   # round 2: the wing ends on the smaller patch
def lid_edge_Z(X): return 1.25 + 0 * np.asarray(X, float)      # open eyes: no rest lid over the lens (the rig adds lids)
def lash_halfw(t):   # thin at the inner end, thick over the outer top and the wing root, tapering to the wing's point
    t = np.asarray(t, float)
    return .085 + .065 * smooth(0, .30, t) + .075 * smooth(.42, .66, t) - .225 * smooth(.68, 1.0, t)

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
NOSE_LOOPS = [(.011, 12), (.022, 18), (.033, 26), (.044, 34), (.054, 40), (.063, 46)]   # fine rings over the button
NOSE_RZ = .70             # flattened ovals (the mouth sits close under her wide nose)
_nc = np.array(pts[tags['nose_c'][0]])
for k, (rr, n) in enumerate(NOSE_LOOPS):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    _ref = to_dom(surf_dir(rr * W * np.cos(a), NZ + rr * W * np.sin(a)))
    rd = float(np.median(np.linalg.norm(_ref - _nc, axis=1)))
    if k: rd = max(rd, _rd_prev * 1.15)
    _rd_prev = rd
    add_loop(_nc + rd * np.stack([np.cos(a), NOSE_RZ * np.sin(a)], -1), 'nose_%d' % k)
MOUTH_LOOPS = [(.116, .005, .036), (.128, .007, .042), (.140, .009, .048)]   # round MC: corners z .252, the dip .216
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
band = smooth(.52, .42, np.abs(q[:, 0])) * smooth(.06, .14, q[:, 2]) * smooth(.72, .66, q[:, 2]) * smooth(math.radians(80), math.radians(66), alpha)
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
_nr = np.hypot(dom[:, 0] - _nc[0], (dom[:, 1] - _nc[1]) / NOSE_RZ)
keep &= ~(frontp & (_nr < _rd_prev * 1.10))
mz = (Pf[:, 2] - MC) / W
keep &= ~(frontp & ((Pf[:, 0] / (.152 * W)) ** 2 + (mz / np.where(mz > 0, .013, .056)) ** 2 < 1))
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
skin = mesh('sasa_head_skin', verts, faces, face_uvs, 'head', 'head', raw_uv=True, normals=vnorm)
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

# ============================================================== LASH RIBBONS: the upper lash line and its wing
# a flattened tapered tube lying on the skin along the opening's upper rim (its lower edge just over the lens), carried
# past the outer corner into the sheet's wing; <= 0.012 W proud; separate objects (origin at the eye centre) so the rig
# can hang them on the upper lids. The ramp's light end gives its top a soft cool sheen, so it reads on the dark patch.
def eye_pt(s, X, Z):
    """eye units (X > 0 outer) -> skin point, its normal"""
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S = np.stack([x, y, z], -1); return S, grad_n(S)
lash_info = {}
NLT, NLS = 42, 10
for s, tag in ((-1, 'R'), (1, 'L')):
    tt = np.linspace(0, 1, NLT + 1)
    C2 = np.array([catmull(LASH_CTRL, t) for t in tt])
    S, n = eye_pt(s, C2[:, 0], C2[:, 1])
    tg = np.gradient(S, axis=0); tg = unit(tg - n * (tg * n).sum(1, keepdims=True)); sd = unit(np.cross(n, tg))
    hw = np.maximum(lash_halfw(tt), .030) * EHH
    hp = (.0080 * W) * (.60 + .40 * smooth(0, .25, tt)) * (1 - .65 * smooth(.72, 1.0, tt))   # proud height
    V = []; NV = []
    for i in range(NLT + 1):
        for k in range(NLS):
            a = 2 * PI * k / NLS; ca, sa = math.cos(a), math.sin(a)
            up = hp[i] * (sa if sa > 0 else .45 * sa)
            V.append(S[i] + sd[i] * hw[i] * ca + n[i] * (up - .0010 * W))
            NV.append(unit(sd[i] * ca / max(hw[i], 1e-4) + n[i] * sa / max(hp[i], 1e-4)))
    V = np.array(V); NV = np.array(NV)
    tip = len(V); V = np.vstack([V, S[-1] + tg[-1] * hw[-1] * .6 + n[-1] * (.25 * hp[-1])]); NV = np.vstack([NV, tg[-1]])
    root = len(V); V = np.vstack([V, S[0] - tg[0] * hw[0] * .8 + n[0] * (.2 * hp[0])]); NV = np.vstack([NV, -tg[0]])
    F = []
    for i in range(NLT):
        for k in range(NLS):
            a_, b_ = i * NLS + k, i * NLS + (k + 1) % NLS; F.append((a_, b_, b_ + NLS, a_ + NLS))
    for k in range(NLS): F.append((NLT * NLS + k, NLT * NLS + (k + 1) % NLS, tip))
    for k in range(NLS): F.append(((k + 1) % NLS, k, root))
    val = sval(NV, 0., hi=.30, lo=.10)
    make_obj('lash.' + tag, V, F, ramp_uv('lash', val), 'lash.' + tag, NV)
    lash_info[tag] = dict(tip=[float(v) for v in S[-1]], root=[float(v) for v in S[0]], max_proud_W=float(hp.max() / W))
LOG['lash'] = lash_info

# ============================================================== EARS: thick round discs on the crown's corners
# the sheet: circle centres (+-0.335, 0.695) W, diameter 0.33 W; the side view sets them ~0.1 W behind the head centre
EAR = dict(x=.338, y=.090, z=.705, r=.160, t=.094, p=(2.15, 2.2, 2.15), yaw=12., up=10., roll=10.)
ear_info = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    C = L2M(np.array([s * EAR['x'], EAR['y'], EAR['z']]))
    yw = math.radians(EAR['yaw']); ne = unit(np.array([s * math.sin(yw), -math.cos(yw), math.tan(math.radians(EAR['up']))]))
    up = np.array([0, 0, 1.]); up = unit(up - ne * (up @ ne)); tt_ = np.cross(up, ne)
    rl = math.radians(EAR['roll']) * s                      # the tops lean outward
    up, tt_ = unit(up * math.cos(rl) + tt_ * math.sin(rl)), unit(tt_ * math.cos(rl) - up * math.sin(rl))
    R = np.stack([tt_, ne, up], 1)                           # columns: local x (lateral), y (thickness, front), z (up)
    rad = np.array([EAR['r'], EAR['t'], EAR['r']]) * W
    def ear_sdf(p, C=C, R=R, rad=rad):
        q = (p - C) @ R; return sell(q, [0, 0, 0], rad, EAR['p'])
    ob, P_, N_ = sdf_ball('ear.' + tag, ear_sdf, C, 6 if FAST else 9, 'ear.' + tag, 'black', scale=(1, .5, 1), orient=R, occ_f=head_sdf, occ_k=.30)
    ear_info[s] = dict(C=C, R=R, sdf=ear_sdf, n=ne)
    base_ = C.copy()
    for _ in range(40):                                     # the base point: the head surface below the ear centre
        if head_sdf(base_[None])[0] < 0: break
        base_ = base_ - unit(C - L2M(np.array([0, 0, .30]))) * .004
    ear_info[s]['base'] = base_

# ============================================================== BODY AND COSTUME (metres)
def cr_interp(z, Z, Y):
    """Catmull-Rom (uniform-in-index) interpolation of a table, vectorised"""
    z = np.asarray(z, float); i = np.clip(np.searchsorted(Z, z) - 1, 0, len(Z) - 2); t = np.clip((z - Z[i]) / (Z[i + 1] - Z[i]), 0, 1)
    p0 = Y[np.maximum(i - 1, 0)]; p1 = Y[i]; p2 = Y[i + 1]; p3 = Y[np.minimum(i + 2, len(Z) - 1)]
    return .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
def lathe_sdf_factory(T, yc, n, z0, z1, k_cap=.03):
    T = np.asarray(T, float)
    def f(p):
        x, y, z = p[..., 0], p[..., 1] - yc, p[..., 2]
        zz = np.clip(z, T[0, 0], T[-1, 0])
        a = cr_interp(zz, T[:, 0], T[:, 1]); bf = cr_interp(zz, T[:, 0], T[:, 2]); bb = cr_interp(zz, T[:, 0], T[:, 3])
        b = np.where(y < 0, bf, bb)
        s_ = (np.abs(x / a) ** n + np.abs(y / b) ** n) ** (1 / n)
        d = (s_ - 1) * np.minimum(a, b)
        return smax(smax(d, z - z1, k_cap), z0 - z, k_cap)
    return f
# --- the kimono torso: z, half-width, front half-depth, back half-depth (the sheet's side view: front -0.173, back
# +0.199 at z 0.465); hidden under the obi below z 0.39, its top tucked up inside the head
KIM = [(.300, .204, .204, .214), (.340, .203, .202, .212), (.390, .200, .196, .208), (.430, .195, .188, .204),
       (.470, .187, .178, .199), (.510, .175, .168, .190), (.545, .158, .156, .176), (.575, .136, .138, .156),
       (.605, .110, .112, .128), (.640, .080, .082, .096)]
KIM_N = 2.3; KIM_YC = .004
kimono_sdf = lathe_sdf_factory(KIM, KIM_YC, KIM_N, .300, .655, .035)
KZ0, KZ1 = .29, .67
def kim_uv(P):
    th = np.arctan2(P[:, 0], -(P[:, 1] - KIM_YC)); return np.stack([.5 + th / (2 * PI), (P[:, 2] - KZ0) / (KZ1 - KZ0)], -1)
def build_kimono():
    D, F = cube_sphere(9 if FAST else 16); D = unit(D * np.array([1., 1., 1.15]))
    o = np.array([0, KIM_YC, .47]); P = ray_outer(kimono_sdf, o, D, t1=.5); N = grad(kimono_sdf, P)
    uv = kim_uv(P); fuv = []
    for f in F:
        u = uv[list(f), 0].copy(); v = uv[list(f), 1]
        if u.max() - u.min() > .5: u = np.where(u < .5, 1., u)     # faces straddling the back seam (under the kerchief's nape): no wrap
        fuv.append([tuple(au('kimono', uu, vv)) for uu, vv in zip(u, v)])
    return make_obj('kimono_torso', P, F, fuv, 'body', N)
kimono_ob = build_kimono()
# --- the obi: a thick band of two soft rolls (the sheet: z 0.296..0.393, the groove at 0.345; lower roll 0.235 half-wide,
# the upper 0.222; 0.229 half-deep): a lathe surface, ramp-shaded, its edges rolled in under the kimono / over the skirt
OBI = [(.288, .200, .206), (.294, .218, .224), (.302, .230, .236), (.314, .236, .242), (.328, .235, .241), (.339, .229, .235),
       (.345, .222, .228), (.351, .224, .230), (.361, .227, .233), (.374, .226, .232), (.385, .219, .225), (.392, .206, .212),
       (.398, .188, .194)]
OBI_YC = .004
def lathe_ring(name, rows, group, ramp, N=72, n=2.3, fold=None, zfn=None, shade=None, cap=(False, False), yc=0.):
    """ring surface from rows (z, ax, ay[, ay_back]); superellipse sections; ramp UVs from the grid normals"""
    V = []; M = len(rows)
    for j, row in enumerate(rows):
        z, ax, ay = row[:3]; ayb = row[3] if len(row) > 3 else ay; t = j / (M - 1)
        for i in range(N):
            a = 2 * PI * i / N; f = fold(a, t) if fold else 1.; zz = zfn(a, t, z) if zfn else z
            byy = ay if math.cos(a) > 0 else ayb
            V.append((ax * float(spow(np.array(math.sin(a)), 2 / n)) * f, yc - byy * float(spow(np.array(math.cos(a)), 2 / n)) * f, zz))
    F = []
    for j in range(M - 1):
        for i in range(N):
            ni = (i + 1) % N; F.append((j * N + i, j * N + ni, (j + 1) * N + ni, (j + 1) * N + i))
    V = np.array(V)
    for end, j in ((0, 0), (1, M - 1)):
        if not cap[end]: continue
        k = len(V); V = np.vstack([V, [0, yc, rows[j][0]]])
        for i in range(N): F.append((k, j * N + (i + 1) % N, j * N + i) if end == 0 else (k, j * N + i, j * N + (i + 1) % N))
    G = V[:M * N].reshape(M, N, 3); du = np.roll(G, -1, 1) - np.roll(G, 1, 1)
    dv = np.concatenate([G[1:2] - G[0:1], G[2:] - G[:-2], G[-1:] - G[-2:-1]], 0)
    Nn = unit(np.cross(dv, du)).reshape(-1, 3)
    out = V[:M * N] - np.array([0, yc, 0]); out[:, 2] = 0
    if ((Nn * out).sum(1) < 0).mean() > .5: Nn = -Nn
    NV = np.vstack([Nn, np.tile([0, 0, 1.], (len(V) - M * N, 1))])
    val = shade(V, NV) if shade is not None else sval(NV)
    ob = make_obj(name, V, F, ramp_uv(ramp, val), group, NV)
    return ob, V, NV
obi_sdf = lathe_sdf_factory([(r[0], r[1], r[2], r[2]) for r in OBI], OBI_YC, 2.3, .288, .398, .006)
lathe_ring('obi_band', OBI, 'body', 'obi', N=72, yc=OBI_YC, shade=lambda P, N: sval(N, .20 * ao(kimono_sdf, P, N, .02), hi=.22, lo=.30))
# --- the pleated skirt: 12 broad rounded box pleats deepening toward the hem, each panel's hem a soft curve, a rolled hem
# and an inner face back up (never paper-thin); the sheet: 0.444 m wide under the obi, 0.613 m at z 0.105, hem ~0.065
SK = [(.335, .204, .210, .222), (.300, .216, .222, .234), (.262, .236, .240, .252), (.222, .255, .252, .264),
      (.182, .273, .262, .274), (.142, .289, .270, .282), (.108, .303, .276, .288), (.086, .305, .277, .289),
      (.073, .300, .272, .284), (.066, .292, .265, .277), (.068, .284, .258, .270), (.080, .280, .254, .266), (.110, .277, .251, .263)]
NPL = 12
def pleat_d(a):
    ph = (np.asarray(a) * NPL / (2 * PI) + .5) % 1.0; return np.minimum(ph, 1 - ph)   # 0 at a fold line, 0.5 mid-panel (a panel centred in front)
def skirt_fold(a, t):
    d = float(pleat_d(a)); tt = .35 + .65 * min(1., t / .62) ** 1.2
    valley = math.exp(-(d / .045) ** 2); bulge = math.sin(PI * min(d / .5, 1.)) ** .5
    return 1 + tt * (.007 * bulge - .030 * valley)
def skirt_z(a, t, z):
    if t < .55: return z
    d = float(pleat_d(a)); return z - .006 * math.sin(PI * min(d / .5, 1.)) ** 1.5
def skirt_shade(P, N):
    th = np.arctan2(P[:, 0], -(P[:, 1] - .010)); d = pleat_d(th)
    val = sval(N, .18 * ao(obi_sdf, P, N, .03), hi=.34, lo=.16)                 # faces near the base, tops toward the light end
    val = val - .26 * np.exp(-(d / .035) ** 2) * (.45 + .55 * smooth(.30, .14, P[:, 2]))   # the deep folds (ramp floor #42523c)
    val = val + .22 * smooth(.095, .075, P[:, 2]) * (np.abs(d) > .06)              # the rolled hem catches light
    return clamp(val)
skirt_ob, SKV, _ = lathe_ring('pleated_skirt', SK, 'body', 'skirt', N=NPL * 14, yc=.010, fold=skirt_fold, zfn=skirt_z, shade=skirt_shade)
# --- the round cream tail on the back, at the obi's lower edge (the sheet's back view: 0.11 m ball, centre z 0.276)
TAIL = ([0, .250, .278], [.056, .052, .055])
def tail_sdf(p): return ell(p, *TAIL)
tail_ob, _, _ = sdf_ball('round_tail', tail_sdf, np.array(TAIL[0]), 6 if FAST else 7, 'tail', 'fur',
                         occ_f=lambda p: np.minimum(obi_sdf(p), kimono_sdf(p)), occ_k=.35)

# --- sleeves and arms (A-pose 40 deg out: the sheet's front holds them ~46 deg out; 40 clears the wide skirt)
ARM_DEG = 40.
joint_arms = {}; sleeve_info = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    a = math.radians(ARM_DEG)
    Sh = np.array([s * .168, .004, .492])
    Dv = np.array([s * math.sin(a), 0, -math.cos(a)]); Pv = np.array([s * math.cos(a), 0, math.sin(a)]); Yv = np.array([0, 1., 0])
    # the sleeve: outer surface flaring from the shoulder cap to the wide opening, a rolled lip, the inner surface back in
    T0, T1 = -.070, .168
    prof_s = []
    for t in np.linspace(T0, T1, 12):
        k = (t - T0) / (T1 - T0)
        a_ = .058 + (.096 - .058) * math.sin(min(1., k / .55) * PI / 2) ** .8          # along Pv (in the front plane)
        b_ = .066 + (.104 - .066) * math.sin(min(1., k / .55) * PI / 2) ** .8          # front-back
        prof_s.append((t, a_, b_, -.016 * k ** 1.3))
    lip = [(T1 + .006, -.004, -.004), (T1 + .009, -.011, -.011), (T1 + .006, -.018, -.018), (T1 - .002, -.021, -.021),
           (T1 - .030, -.022, -.022), (T1 - .070, -.024, -.024)]
    tl, al, bl, sg = prof_s[-1]
    for (t, da, db) in lip: prof_s.append((t, al + da, bl + db, sg))
    NS_ = 30; V = []; F = []; M = len(prof_s)
    for j, (t, a_, b_, sg) in enumerate(prof_s):
        c = Sh + Dv * t - Pv * sg
        for i in range(NS_):
            ph = 2 * PI * i / NS_
            V.append(c + Pv * (a_ * float(spow(np.array(math.cos(ph)), 2 / 2.5))) + Yv * (b_ * float(spow(np.array(math.sin(ph)), 2 / 2.5))))
    for j in range(M - 1):
        for i in range(NS_):
            ni = (i + 1) % NS_; F.append((j * NS_ + i, j * NS_ + ni, (j + 1) * NS_ + ni, (j + 1) * NS_ + i))
    for j in (0, M - 1):
        kk = len(V); t, a_, b_, sg = prof_s[j]; V.append(Sh + Dv * t - Pv * sg)
        for i in range(NS_): F.append((kk, j * NS_ + i, j * NS_ + (i + 1) % NS_) if j == 0 else (kk, j * NS_ + (i + 1) % NS_, j * NS_ + i))
    V = np.array(V)
    me_ = bpy.data.meshes.new('tmp'); me_.from_pydata(V.tolist(), [], F); me_.update()
    bm = bmesh.new(); bm.from_mesh(me_); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me_); bm.free()
    me_.update(); vn = np.zeros(len(V) * 3); me_.vertices.foreach_get('normal', vn); vn = vn.reshape(-1, 3); bpy.data.meshes.remove(me_)
    inner = np.zeros(len(V), bool); inner[(M - 3) * NS_:M * NS_] = True              # deep inside the sleeve: dark
    occ = .30 * ao(kimono_sdf, V, vn, .04)
    val = sval(vn, occ, hi=.22, lo=.26); val = np.where(inner, val * .45, val)
    make_obj('kimono_sleeve.' + tag, V, F, ramp_uv('kimono', val), 'arm.' + tag, None)
    # the arm: a black tube from inside the sleeve to a mitten paw (bend loops at the elbow)
    root = Sh - Dv * .040; elbow = Sh + Dv * .130; wrist = Sh + Dv * .245
    rad = lambda t: .046 + .004 * float(smooth(.10, .45, t)) + .017 * float(smooth(.62, 1., t))
    limb('arm.' + tag, [root, Sh, elbow, wrist], rad, 'arm.' + tag, rings=18, sides=18, cap_rows=7, cap_len=1.05,
         occ_f=lambda p: np.minimum(kimono_sdf(p), 9.), squash=1.14, occ_k=.25)
    joint_arms[tag] = {'shoulder': [float(v) for v in Sh], 'elbow': [float(v) for v in elbow], 'wrist': [float(v) for v in wrist],
                       'paw_tip': [float(v) for v in wrist + Dv * rad(1.) * 1.05]}
    sleeve_info[tag] = {'opening_centre': [float(v) for v in Sh + Dv * T1], 'opening_half_sizes_m': [round(al, 3), round(bl, 3)]}
# --- legs (hidden under the skirt, for the rig) and the big feet
FOOT = dict(r=[.080, .132, .052], p=(2.2, 2.1, 2.0), pzlo=3.4, rzlo=.044)
joint_legs = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    hip = np.array([s * .110, .002, .262]); knee = np.array([s * .118, -.004, .170]); ankle = np.array([s * .126, -.012, .078])
    limb('leg.' + tag, [hip + np.array([0, 0, .05]), hip, knee, ankle], lambda t: .066, 'leg.' + tag,
         rings=8, sides=12, cap_rows=3, cap_len=.5, occ_f=None, squash=1.05)
    fc = np.array([s * .131, -.036, .044])
    def foot_sdf(p, fc=fc): return sell(p, fc, FOOT['r'], FOOT['p'], FOOT['pzlo'], FOOT['rzlo'])
    sdf_ball('big_foot.' + tag, foot_sdf, fc + np.array([0, 0, .01]), 7 if FAST else 8, 'leg.' + tag, 'black', t1=.4)
    joint_legs[tag] = {'hip': [float(v) for v in hip], 'knee': [float(v) for v in knee], 'ankle': [float(v) for v in ankle],
                       'toe': [float(fc[0]), float(fc[1] - .12), .035]}

# --- the kerchief: a soft band lying on the shoulders under the chin (higher at the nape), dipping in front to a round
# knot; two leaf-shaped ends hang from the knot (the sheet: knot 0.055 m at z 0.50, ends 0.066 x 0.085 m, tips z 0.41)
KC = dict(rx=.180, ryf=.186, ryb=.140, yc=.008, zs=.552, zf=.484, zb=.592, hh=.034, ht=.013)
def kerchief_centre(t):
    c = math.cos(t); y = KC['yc'] - (KC['ryf'] if c > 0 else KC['ryb']) * c
    fa = min(1., abs(math.atan2(math.sin(t), c)) / (PI / 2)) if c > 0 else 1.        # 0 at the front centre, 1 at the sides
    zc = KC['zf'] + (KC['zs'] - KC['zf']) * smooth(0, 1, fa ** .85) * (fa ** .15) + (KC['zb'] - KC['zs']) * max(-c, 0) ** 1.5   # round 2: a shawl V
    return np.array([KC['rx'] * math.sin(t), y, zc])
def build_kerchief():
    NT, NS = 64 if not FAST else 48, 12
    th = np.linspace(0, 2 * PI, NT, endpoint=False); G = np.zeros((NT, NS, 3))
    for i, t in enumerate(th):
        c = kerchief_centre(t); tg = unit(kerchief_centre(t + 1e-3) - kerchief_centre(t - 1e-3))
        out = unit(np.cross(tg, np.array([0, 0, 1.])))
        if out @ (c - np.array([0, KC['yc'], c[2]])) < 0: out = -out
        upv = unit(np.cross(out, tg))
        if upv[2] < 0: upv = -upv
        front = max(math.cos(t), 0)
        back_ = max(-math.cos(t), 0)
        hh = KC['hh'] * (1 - .50 * front ** 2.5 - .30 * back_ ** 1.5) * (1 + .04 * math.sin(3 * t + .4)); ht = KC['ht'] * (1 + .25 * front)
        upv = unit(upv - out * (.55 * (1 - front)))                             # lies on the sloping shoulders (top edge in)
        for k in range(NS):
            a = 2 * PI * k / NS; ca, sa = math.cos(a), math.sin(a)
            # a soft lens section: the outer face rounder, tilted to lie on the shoulders (top edge tucked in)
            G[i, k] = c + out * (ht * float(spow(np.array(ca), .85))) + upv * (hh * float(spow(np.array(sa), .9)))
    du = np.roll(G, -1, 0) - np.roll(G, 1, 0); dv = np.roll(G, -1, 1) - np.roll(G, 1, 1); Nn = unit(np.cross(du, dv))
    cen = np.array([0, KC['yc'], KC['zs']])
    if ((Nn * (G - cen)).sum(-1) < 0).mean() > .5: Nn = -Nn
    V = G.reshape(-1, 3); NV = Nn.reshape(-1, 3); F = []
    for i in range(NT):
        for k in range(NS):
            a_ = i * NS + k; b_ = ((i + 1) % NT) * NS + k; c_ = ((i + 1) % NT) * NS + (k + 1) % NS; d_ = i * NS + (k + 1) % NS
            F.append((a_, b_, c_, d_))
    val = sval(NV, .35 * ao(head_sdf, V, NV, .035), hi=.20, lo=.24)
    return make_obj('kerchief_band', V, F, ramp_uv('kerchief', val), 'kerchief', NV)
kerchief_ob = build_kerchief()
KNOT_C = np.array([0, -.203, .494]); KNOT_R = [.031, .027, .029]
def knot_sdf(p): return sell(p, KNOT_C, KNOT_R, (2.1, 2.0, 2.1))
sdf_ball('kerchief_knot', knot_sdf, KNOT_C, 6 if FAST else 7, 'kerchief', 'kerchief', occ_f=head_sdf, t1=.10)
kerchief_end_info = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    Ce = np.array([s * .031, -.208, .446]); rl = math.radians(26) * s; tl = math.radians(-9)
    Rz = np.array([[math.cos(rl), 0, -math.sin(rl)], [0, 1, 0], [math.sin(rl), 0, math.cos(rl)]])   # roll about y
    Rx = np.array([[1, 0, 0], [0, math.cos(tl), -math.sin(tl)], [0, math.sin(tl), math.cos(tl)]])   # the end hangs forward
    R = Rx @ Rz
    rad = np.array([.037, .012, .051])
    def end_sdf(p, Ce=Ce, R=R, rad=rad):
        q = (p - Ce) @ R; v = np.clip(-q[..., 2] / rad[2], -1, 1)
        taper = 1 - .62 * np.clip(v, 0, 1) ** 1.5 + .05 * np.clip(-v, 0, 1)                 # a leaf: round top, pointed tip
        q = np.stack([q[..., 0] / np.maximum(taper, .2), q[..., 1] / (1 - .45 * np.clip(v, 0, 1) ** 2), q[..., 2]], -1)
        return sell(q, [0, 0, 0], rad, (2.2, 2.0, 2.3)) * np.minimum(taper, 1)
    sdf_ball('kerchief_end.' + tag, end_sdf, Ce, 6 if FAST else 7, 'kerchief_end.' + tag, 'kerchief', scale=(1, .4, 1.4), orient=R,
             occ_f=knot_sdf, occ_k=.25, t1=.12)
    kerchief_end_info[tag] = dict(top=[float(v) for v in Ce + R @ np.array([0, 0, rad[2]])], tip=[float(v) for v in Ce - R @ np.array([0, 0, rad[2]])])

# hidden surface: the parts buried in the head / torso / obi
LOG['culled_faces'] = {}
def _mn(*fs): return lambda p: np.minimum.reduce([f(p) for f in fs])
CULL = {'ear.': (head_sdf, .006), 'kimono_torso': (_mn(head_sdf, obi_sdf), .006), 'pleated_skirt': (obi_sdf, .006),
        'obi_band': (kimono_sdf, .030), 'kerchief_band': (_mn(head_sdf, kimono_sdf), .004), 'round_tail': (_mn(obi_sdf, kimono_sdf), .006),
        'kimono_sleeve.': (kimono_sdf, .010), 'arm.': (kimono_sdf, .012)}
for g, obs in parts.items():
    for ob in obs:
        for key, (f_, m_) in CULL.items():
            if ob.name.startswith(key): LOG['culled_faces'][ob.name] = cull_buried(ob, f_, m_); break

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
# round 2 (director): the sheet's outline 8% smaller about its centroid, the outer-lower corner fuller (a drooping
# teardrop), the top a softer arc; an 8% dark rim still rings the eye opening (measure/patch_r2.py)
PATCH2 = [(0.1132, 0.4120), (0.1127, 0.3953), (0.1147, 0.3785), (0.1192, 0.3621), (0.1285, 0.3477), (0.1400, 0.3354), (0.1536, 0.3258), (0.1670, 0.3171), (0.1810, 0.3101), (0.1951, 0.3042), (0.2094, 0.2986), (0.2242, 0.2934), (0.2398, 0.2886), (0.2567, 0.2839), (0.2750, 0.2808), (0.2946, 0.2796), (0.3157, 0.2806), (0.3366, 0.2858), (0.3562, 0.2956), (0.3710, 0.3114), (0.3804, 0.3308), (0.3838, 0.3523), (0.3805, 0.3743), (0.3744, 0.3943), (0.3662, 0.4120), (0.3581, 0.4276), (0.3513, 0.4419), (0.3451, 0.4556), (0.3348, 0.4669), (0.3256, 0.4778), (0.3167, 0.4889), (0.3075, 0.5002), (0.2970, 0.5110), (0.2850, 0.5211), (0.2714, 0.5300), (0.2563, 0.5372), (0.2398, 0.5424), (0.2223, 0.5451), (0.2042, 0.5448), (0.1863, 0.5412), (0.1692, 0.5343), (0.1537, 0.5242), (0.1406, 0.5112), (0.1305, 0.4959), (0.1230, 0.4794), (0.1181, 0.4624), (0.1150, 0.4454), (0.1134, 0.4286)]
PATCH_L = closed_cr(PATCH2, 4); PATCH_R = PATCH_L * np.array([-1, 1])
def patch_alpha(q, aa=.0030):
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    d = np.minimum(poly_sd(x, z, PATCH_L), poly_sd(x, z, PATCH_R))
    d = smax(d, y - .02, .03)                                       # front half only
    return 1 - smooth(-aa, aa, d)
def paint_head(d): return paint_head_P(radial_hit(d))
def lash_paint_alpha(x, z, fr):
    """the lash line painted on the skin under the ribbon (front projection), so no patch shows at its edges"""
    out = np.zeros(len(x))
    tt = np.linspace(0, 1, 40); C2 = np.array([catmull(LASH_CTRL, t) for t in tt]); hw = np.maximum(lash_halfw(tt), .012) * EHH
    for s in (-1, 1):
        Pl = np.stack([s * EX + s * EHW * C2[:, 0], EZ + EHH * C2[:, 1]], -1)
        box = (fr > 0) & (np.abs(x - s * (EX + .45 * EHW)) < .14 * W) & (np.abs(z - (EZ + .9 * EHH)) < .07 * W)
        a = np.zeros(len(x)); a[box] = stroke(x[box], z[box], Pl, .80 * hw, .0022 * W); out = np.maximum(out, a)
    return out
def paint_head_P(P):
    n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .03, HY - .07, y)
    C = np.broadcast_to(rgb('fur'), (len(x), 3)).copy()
    # soft painted shade: under the jaw toward the neck, the jaw's sides, the ear bases (warm grey, never hard)
    under = smooth(-.25, -.85, n[:, 2]) * (1 - smooth(.08, .26, zr))
    C = mix(C, rgb('furshade'), .80 * under)
    jaw = smooth(.45, .90, np.abs(n[:, 0])) * (1 - smooth(.14, .44, zr))
    C = mix(C, rgb('furshade'), .40 * jaw)
    back = smooth(.05, .30, y / W) * (1 - smooth(.10, .40, zr))
    C = mix(C, rgb('furshade'), .35 * back)
    for s in (-1, 1):
        dd = np.linalg.norm(P - ear_info[s]['base'], axis=1)
        C = mix(C, rgb('furshade'), .45 * np.exp(-(dd / (.10 * W)) ** 2))
    # the short muzzle: a touch lighter and warmer, with a soft shade round its lower edge (painted, no shelf)
    mzr = np.sqrt((x / (.15 * W)) ** 2 + ((z - (CHIN + .255 * W)) / (.085 * W)) ** 2)
    C = mix(C, rgb('furlight'), .55 * (1 - smooth(.55, 1.05, mzr)) * fr)
    C = mix(C, rgb('#efe3d6'), .30 * smooth(.85, 1.15, mzr) * (1 - smooth(1.15, 1.6, mzr)) * fr * (z < CHIN + .25 * W))
    # the eye patches: clean rounded drooping ovals, true black with a soft cool light on their upper part
    pa = patch_alpha(q)
    Cb = mix(rgb('black'), rgb('#3b3642'), .55 * smooth(.42, .56, zr) * smooth(.0, .5, n[:, 2] + .3))
    C = mix(C, Cb, pa)
    # the lash line under the ribbon
    if not RIG: C = mix(C, rgb('lash'), lash_paint_alpha(x, z, fr) * fr)       # (the rig's ribbon rides the lid: no painted copy left behind)
    # nose: a wide rounded inverted triangle with a soft highlight on its top
    nx = x / W; nzz = (z - CHIN) / W
    tri = poly_sd(nx, nzz, [(-.0285, .3170), (.0285, .3170), (0, .2930)]) - .0170   # 0.091 W wide, a soft rounded triangle
    a_n = (1 - smooth(-.0018, .0018, tri)) * fr * (nzz > .24)
    Cn = mix(rgb('nose'), rgb('#5c5560'), .55 * np.exp(-(((nx + .008) / .018) ** 2 + ((nzz - .3235) / .0085) ** 2)))
    C = mix(C, Cn, a_n)
    # blush ovals
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .85 * (1 - smooth(.55, 1.08, r)) * fr * (1 - pa))
    # brows: soft arcs, the inner end high, round and thick, the outer end lower and tapered (kind)
    for s in (-1, 1):
        Pb0 = np.array([(.150, .628), (.170, .638), (.195, .641), (.222, .632), (.245, .614), (.264, .591)])
        Pb0 = np.array([.207, .623]) + (Pb0 - np.array([.207, .623])) * .85               # round 2: 15% shorter
        Pb = Pb0 * np.array([s * W, W]) + np.array([0, CHIN])
        half = np.array([.0140, .0136, .0120, .0096, .0068, .0032]) * .60 * W              # round 2: 60% of the thickness
        box = fr * ((np.abs(x - s * BROW_X) < .10 * W) & (np.abs(z - BROW_Z) < .06 * W))
        a = np.zeros(len(x)); ib = box > 0
        a[ib] = stroke(x[ib], z[ib], Pb, half, .0026 * W)
        C = mix(C, rgb('brow'), .97 * a * fr)
    # mouth: a gentle smile in two arcs meeting under the philtrum with a tiny rise, and the line up to the nose
    t = np.linspace(-1, 1, 61); at = np.abs(t)
    zm = .2175 + .0345 * at ** 2.2 + .0060 * np.exp(-(t * MHW / W / .012) ** 2)
    Pm = np.stack([MHW * t, CHIN + zm * W], -1)
    half = .0046 * W - .0016 * W * at ** 3
    ib = (fr > 0) & (np.abs(x) < .13 * W) & (np.abs(z - (CHIN + .24 * W)) < .07 * W)
    a = np.zeros(len(x)); a[ib] = stroke(x[ib], z[ib], Pm, half, .0022 * W)
    Pp = np.array([[0, CHIN + .280 * W], [0, CHIN + .2235 * W]])
    a2 = np.zeros(len(x)); a2[ib] = stroke(x[ib], z[ib], Pp, np.array([.0036 * W, .0040 * W]), .0022 * W)
    C = mix(C, rgb('mouth'), .95 * np.maximum(a, a2))
    # the lip puffs' soft shade just above the mouth line
    for s in (-1, 1):
        r = np.sqrt(((x - s * .045 * W) / (.042 * W)) ** 2 + ((z - (CHIN + .238 * W)) / (.016 * W)) ** 2)
        C = mix(C, rgb('#f2e9df'), .18 * (1 - smooth(.6, 1.2, r)) * fr * (1 - np.maximum(a, a2)))
    return C

def paint_eye(U, V, s):
    """eye chart: X along world x (not mirrored), eye units; the iris tucked toward the nose, a generous sclera on the
    outer side, a big pupil, the catchlights lit from her left (the sheet's single light, so not mirrored)"""
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * .22; iz = -.03; irx = .736; irz = .98      # round 2: a sliver of white on the nasal side too
    C = mix(rgb('sclera'), rgb('#e6dcdc'), .55 * smooth(.25, .95, Z))
    C = mix(C, rgb('#ece4e4'), .30 * smooth(.3, 1., s * X))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('#a77a3c'), rgb('iris'), smooth(-.95, -.45, ez))
    I = mix(I, rgb('#5e4020'), smooth(-.30, .35, ez))
    I = mix(I, rgb('#3c2814'), smooth(.35, .90, ez))
    I = mix(I, rgb('#3e2a14'), smooth(.82, 1.0, r) * .80)
    I = I * (1 - .03 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 24 + r * 8)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix; pz = -.05; R = np.sqrt(((X - px_) / (.70 * irx)) ** 2 + ((Z - pz) / (.71 * irz)) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.985, 1.015, R))
    big = np.sqrt(((X - (px_ + .17)) / .174) ** 2 + ((Z - (pz + .49)) / .207) ** 2)
    small = np.sqrt(((X - (px_ - .14)) / .075) ** 2 + ((Z - (pz - .40)) / .088) ** 2)
    C = mix(C, rgb('#fffbf6'), np.maximum(1 - smooth(.90, 1.08, big), .85 * (1 - smooth(.85, 1.12, small))))
    C = mix(C, rgb('black'), smooth(.965, 1.0, sr))           # the lid contact at the rim (narrow: the white reaches the patch)
    return C
def paint_kimono(U, V):
    """the kimono torso chart (u = angle round the body, front at 0.5; v = height): soft painted light, a soft shade
    under the chin and at the obi, the crossed collar's two creases, the black chest showing at the throat"""
    th = (U.ravel() - .5) * 2 * PI; z = KZ0 + V.ravel() * (KZ1 - KZ0)
    T = np.asarray(KIM, float); zz = np.clip(z, T[0, 0], T[-1, 0])
    a = cr_interp(zz, T[:, 0], T[:, 1]); b = np.where(np.cos(th) > 0, cr_interp(zz, T[:, 0], T[:, 2]), cr_interp(zz, T[:, 0], T[:, 3]))
    r = 1 / ((np.abs(np.sin(th)) / a) ** KIM_N + (np.abs(np.cos(th)) / b) ** KIM_N) ** (1 / KIM_N)
    P = np.stack([r * np.sin(th), KIM_YC - r * np.cos(th), z], -1); N = grad(kimono_sdf, P)
    occ = .35 * ao(lambda p: np.minimum(head_sdf(p), obi_sdf(p)), P, N, .045)
    C = ramp_colour('kimono', sval(N, occ, hi=.14, lo=.26))
    x = P[:, 0]; front = smooth(.15, .45, np.cos(th))
    # the crossed collar: her left panel on top (its edge from her left shoulder down to her right at the obi), the
    # under panel's edge from her right shoulder; soft fabric creases, the top edge with a thin light lip above it
    eB = stroke(x, z, np.array([[.112, .545], [.069, .490], [.018, .438], [-.035, .391]]), np.array([.0030, .0034, .0036, .0036]), .0024)
    eB_l = stroke(x, z, np.array([[.118, .545], [.075, .490], [.024, .438], [-.029, .391]]), np.array([.0026, .0030, .0030, .0030]), .0030)
    eA = stroke(x, z, np.array([[-.128, .540], [-.100, .507], [-.060, .450], [-.024, .394]]), np.array([.0026, .0030, .0030, .0026]), .0030)
    C = mix(C, rgb('kimonolight'), .45 * eB_l * (1 - eB) * front)
    C = mix(C, rgb('#4f7a4d'), .75 * eB * front)
    C = mix(C, rgb('#5a8456'), .55 * eA * front * (1 - eB))
    # the black chest at the throat (seen between the kerchief's halves, above the knot)
    neck = (1 - smooth(.050, .062, np.abs(x) + .55 * np.maximum(0, .56 - z))) * smooth(.512, .526, z) * front
    C = mix(C, rgb('black'), neck)
    return C.reshape(U.shape + (3,))
def paint(chart, U, V):
    if chart == 'head': return paint_head(head_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'headback': return paint_head(headback_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart == 'kimono': return paint_kimono(U, V)
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
    if name in ('head', 'headback', 'kimono'):
        block = np.empty((h, w, 3))
        for r0 in range(0, h, 128): block[r0:r0 + 128] = paint(name, U[r0:r0 + 128], V[r0:r0 + 128])
    else:
        block = paint(name, U, V)
    atlas[y0:y0 + h, x0:x0 + w, :3] = np.round(clamp(block) * 255).astype(np.uint8)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(ROOT, 'tk-sasa-toy_rig_atlas.png') if RIG else os.path.join(ROOT, 'scratch' if FAST else '', 'tk-sasa-toy_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = 'Sasa_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new('Sasa_toy_atlas'); MAT.use_nodes = True
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
NAMES = {'head': 'Sasa_head', 'eye.L': 'Sasa_eye_L', 'eye.R': 'Sasa_eye_R', 'lash.L': 'Sasa_lash_L', 'lash.R': 'Sasa_lash_R',
         'ear.L': 'Sasa_ear_L', 'ear.R': 'Sasa_ear_R', 'body': 'Sasa_body', 'kerchief': 'Sasa_kerchief',
         'kerchief_end.L': 'Sasa_kerchief_end_L', 'kerchief_end.R': 'Sasa_kerchief_end_R', 'arm.L': 'Sasa_arm_L', 'arm.R': 'Sasa_arm_R',
         'leg.L': 'Sasa_leg_L', 'leg.R': 'Sasa_leg_R', 'tail': 'Sasa_tail'}
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
    piv = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'], 'lash.L': eye_centers['L'], 'lash.R': eye_centers['R'],
           'ear.L': tuple(ear_info[1]['base']), 'ear.R': tuple(ear_info[-1]['base']),
           'kerchief_end.L': kerchief_end_info['L']['top'], 'kerchief_end.R': kerchief_end_info['R']['top'],
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
          'root': [0, 0, 0], 'hips': [0, .002, .262], 'spine': [0, .004, .340], 'chest': [0, .006, .440], 'neck': [0, .008, .545],
          'head_base': [0, .000, CHIN + .02], 'head': [float(v) for v in O],
          'jaw_pivot': [0, float(HY - .16 * W), float(CHIN + .16 * W)],
          'mouth_corners': {'L': [float(MHW + .004 * W), float(front_hit(MHW, CHIN + .252 * W)[0]), float(CHIN + .252 * W)],
                            'R': [float(-MHW - .004 * W), float(front_hit(-MHW, CHIN + .252 * W)[0]), float(CHIN + .252 * W)]},
          'eyes': eye_centers, 'upper_lids': {'L': eye_centers['L'], 'R': eye_centers['R'], 'note': 'open eyes; the rig adds the lid shells'},
          'lashes': lash_info,
          'brows': {'L': [BROW_X, float(front_hit(BROW_X, BROW_Z)[0]), BROW_Z], 'R': [-BROW_X, float(front_hit(-BROW_X, BROW_Z)[0]), BROW_Z]},
          'ears': ears_j, 'arms': joint_arms, 'sleeves': sleeve_info, 'legs': joint_legs, 'tail': [float(v) for v in TAIL[0]],
          'kerchief_ends': kerchief_end_info,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth implicit ball (superquadric + low muzzle swelling + nose button), radially projected, analytic normals.',
                    'Eyelid holes are the FULL eye opening, ringed by %d concentric loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth, %d round the nose.' % (len(EYE_SCALES), len(NOSE_LOOPS)),
                    'Sasa_lash_L/R: the upper lash line + wing ribbons lying on the skin, origin at the eye centre (for the rig lids).',
                    'Sasa_arm_L/R = the kimono sleeve + the black arm; the skirt, obi and kimono torso are Sasa_body (the skirt will want its own bones or a cloth ring).',
                    'Ears, kerchief ends and tail are separate objects; buried hidden surface is deleted.']}
if not FAST and not RIG:
    with open(os.path.join(ROOT, 'joints.json'), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model.json'), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not FAST and not RIG: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tk-sasa-toy.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
if not RIG: bpy.ops.export_scene.gltf(filepath=OUT_MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('SASA_BUILD_DONE', json.dumps({'triangles': tri_count, 'model': OUT_MODEL}), flush=True)
