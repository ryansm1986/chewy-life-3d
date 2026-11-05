"""The Blender townsfolk frogs (Z-D6, task folk-frog-toy), Opus build, phase 1 (the models). Blender 4.3, no addons.
Deterministic. One family script with a shared species base and per-design proportions, markings and outfits.

    blender --background --factory-startup --python build_folk-frog-toy.py -- --design a|b|c|all

  a: Momo, the patient gardener (green, peach shirt, moss bib overalls, a leaf cap)    -> public/models/folk-frog-a-toy.glb
  b: Dango, the baker's helper (teal, butter top, cream apron, coral neckerchief)      -> public/models/folk-frog-b-toy.glb
  c: Pip, the schoolkid (lime, sky-blue smock, cream collar, lilac satchel)            -> public/models/folk-frog-c-toy.glb
1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus the three GLBs.

Technique (Kero's head machinery, the folk-cat family structure):
- The head is ONE smooth implicit (frog_head.py): Kero's wide frog skull superquadric (the jowls widest ~0.29 W above
  the chin, a broad low snout swelling, the forehead set back between the domes) with the two eye domes smooth-unioned in
  (one surface, a fillet, no crease), fitted per design to the sheet's head close-up outline, top outline and side profile
  (scratch/fit_head.py, rms <= 0.01 W). The skin is the field's zero surface reached by radial projection (CDT in a
  stereographic domain with edge loops round both eyelid holes and following the smile), every vertex on the surface with
  the field's analytic normal: the face stays convex, no sockets. The cream lower face, nostrils, smile, brows and blush
  are painted on it from 3D positions into one 2048 atlas.
- The eyes are separate flush lens globes in real lid holes; the upper lash line is its own object per eye (a thick
  tapered ribbon on the skin with one wing flick, as on the sheet).
- A: a peach shirt torso, moss overall pants (a bean with two separate trouser legs and rolled hems), front and back bibs
  as thick panels, broad straps over the shoulders, two big cream buttons, a leaf cap (an SDF leaf with a raised rib and
  a curled stem) between the domes.
- B: a plump butter top with a rolled hem, a cream apron (a thick curved panel, a waistband ring with a back clasp,
  broad shoulder bands), a coral neckerchief roll with a rounded knot and two short thick ends.
- C: an A-line sky smock with a rolled hem, a rounded cream collar, one big button, a lilac satchel at her RIGHT hip on a
  broad band from her LEFT shoulder.
- All: short sleeves, capsule arms, mitten hands, short legs, broad flattened oval feet with toe grooves.
"""
import bpy, bmesh, math, json, os, struct, zlib, sys
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import importlib, frog_head as FH
importlib.reload(FH)
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
DESIGN = ARGV[ARGV.index('--design') + 1] if '--design' in ARGV else 'a'
RIG = bool(globals().get('RIG_MODE'))      # reserved for the phase-2 rig script: no approved file is written in rig mode
if RIG: DESIGN = globals().get('RIG_DESIGN', DESIGN)
if DESIGN == 'all':
    import subprocess, time
    for d in ('a', 'b', 'c'):
        p = subprocess.Popen([bpy.app.binary_path, '--background', '--factory-startup', '--python', os.path.abspath(__file__), '--', '--design', d])
        with open(os.path.join(ROOT, 'pids.log'), 'a', encoding='utf-8') as pl:
            pl.write('%s started %d (child of the all-run): design %s\n' % (time.strftime('%H:%M:%S'), p.pid, d))
        try: p.wait(timeout=900)
        except subprocess.TimeoutExpired:
            p.kill(); p.wait(); print('DESIGN_TIMEOUT', d, p.pid, flush=True)
    raise SystemExit(0)
assert DESIGN in ('a', 'b', 'c'), DESIGN
TAG = 'folk-frog-%s-toy' % DESIGN
NM = {'a': 'FolkFrogA', 'b': 'FolkFrogB', 'c': 'FolkFrogC'}[DESIGN]
MODEL = 'D:/projects/chewy-life-3d/public/models/%s.glb' % TAG
os.makedirs(os.path.join(ROOT, 'preview', DESIGN), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {'design': DESIGN}

# ============================================================== per-design configuration (measure-a/b/c.md)
# head-local units: W = the head width at the jowls; x lateral (+ = his left), y depth (+ = back) from the head centre,
# z above the chin. Body numbers in metres (y from the leg axis; the sheet's full-body views).
HEADS = {  # scratch/fit_head.py results (the head close-up outline, top outline and side profile)
    'a': {"A": 0.4979, "BF": 0.3184, "BB": 0.3225, "ZC": 0.291, "HT": 0.3284, "nA_t": 2.1795, "nA_b": 2.2926, "nB_t": 3.751, "nB_b": 2.0514, "nBb_t": 3.0352, "nBb_b": 1.6, "m": 0.2816, "mz": 0.4, "wz": 0.2689, "wx": 0.8, "brow": 0.2384, "bw": 0.2587, "dx": 0.2412, "dy": -0.0649, "dz": 0.5295, "rx": 0.2, "ry": 0.2, "rz": 0.23, "tilt": -6.1632, "k": 0.06, "HYs": -0.0238},   # rms front/top/side-front/side-back 0.0025 0.0036 0.0031 0.0063 (round 2: round domes, the midline valley >= 0.14 W under the dome tops, eyes 22 deg out)
    'b': {"A": 0.4883, "BF": 0.3134, "BB": 0.3207, "ZC": 0.2447, "HT": 0.3641, "nA_t": 3.0199, "nA_b": 2.2287, "nB_t": 4.4867, "nB_b": 3.5, "nBb_t": 2.915, "nBb_b": 1.632, "m": 0.1367, "mz": 0.3611, "wz": 0.1693, "wx": 0.15, "brow": 0.2997, "bw": 0.1793, "dx": 0.2209, "dy": -0.0058, "dz": 0.5355, "rx": 0.2, "ry": 0.1905, "rz": 0.2186, "tilt": 14.918, "k": 0.06, "HYs": 0.0187},   # rms front/top/side-front/side-back 0.0067 0.0076 0.0034 0.0058 (round 2: round domes, the midline valley >= 0.14 W under the dome tops, eyes 22 deg out)
    'c': {"A": 0.4941, "BF": 0.4105, "BB": 0.3235, "ZC": 0.2632, "HT": 0.3871, "nA_t": 2.4308, "nA_b": 2.2129, "nB_t": 4.5, "nB_b": 1.8011, "nBb_t": 2.6623, "nBb_b": 1.6274, "m": 0.0609, "mz": 0.4, "wz": 0.0924, "wx": 0.15, "brow": 0.2706, "bw": 0.2449, "dx": 0.2233, "dy": -0.0624, "dz": 0.5697, "rx": 0.2, "ry": 0.2, "rz": 0.23, "tilt": -9.7011, "k": 0.035, "HYs": -0.0056},   # rms front/top/side-front/side-back 0.0069 0.0110 0.0041 0.0083 (round 2: round domes, the midline valley >= 0.14 W under the dome tops, eyes 22 deg out)
}
CFG = {
    'a': dict(H=1.05, W=.600, HEAD=HEADS['a'],
              EYE=(.270, .481, .120, .116),                 # centre x, z; opening half-width, half-height
              MOUTH=[(-.116, .266), (-.106, .252), (-.088, .239), (-.064, .229), (-.034, .2225), (0., .221)],
              NOSTRIL=(.058, .357, .0135),
              BROW=(.272, .697, .062, .024, .0062, .35),      # centre x, z; half-length, arc rise, half-thickness, outer droop
              BLUSH=(.347, .284, .072, .056),
              CREAM=[(0, .338), (30, .336), (45, .318), (60, .265), (75, .200), (90, .140), (105, .06), (125, -.08)],
              IRIS=dict(ix=.30, iz=-.03, irx=.70, irz=.87, pw=.46, ph=.60, cl=(.42, .43, .19, .20)),
              LASH=(.15, .07), WING=((22, .97), (1.25, .58))),
    'b': dict(H=1.05, W=.610, HEAD=HEADS['b'],
              EYE=(.261, .471, .114, .120),
              MOUTH=[(-.117, .262), (-.107, .247), (-.089, .232), (-.065, .222), (-.034, .2155), (0., .214)],
              NOSTRIL=(.057, .354, .0135),
              BROW=(.233, .690, .060, .022, .0062, .35),
              BLUSH=(.341, .274, .073, .058),
              CREAM=[(0, .338), (30, .330), (45, .312), (60, .262), (75, .198), (90, .140), (105, .06), (125, -.08)],
              IRIS=dict(ix=.30, iz=-.03, irx=.70, irz=.86, pw=.50, ph=.64, cl=(.42, .43, .19, .20)),
              LASH=(.15, .07), WING=((22, .97), (1.25, .58))),
    'c': dict(H=.90, W=.485, HEAD=HEADS['c'],
              EYE=(.257, .481, .121, .120),
              MOUTH=[(-.118, .270), (-.108, .256), (-.090, .243), (-.066, .233), (-.035, .2265), (0., .225)],
              NOSTRIL=(.060, .362, .0135),
              BROW=(.238, .715, .062, .022, .0062, .35),
              BLUSH=(.343, .284, .073, .058),
              CREAM=[(0, .346), (30, .344), (45, .325), (60, .270), (75, .205), (90, .145), (105, .06), (125, -.08)],
              IRIS=dict(ix=.31, iz=-.03, irx=.70, irz=.87, pw=.46, ph=.60, cl=(.42, .43, .19, .20)),
              LASH=(.15, .07), WING=((22, .97), (1.25, .58))),
}[DESIGN]
W = CFG['W']; HP = CFG['HEAD']
head_local, skull_local, dome_local = FH.make_head(HP)
HY = HP['HYs'] * W
_top = float(np.nanmax(FH.top_outline(head_local, np.linspace(0, .45, 46))))
CHIN = CFG['H'] - _top * W                              # the dome tops at the total height
SW = W / .44                                            # Rosie's metric detail sizes (0.44 m head) scaled to this head
LOG['dome_top_W'] = round(_top, 4); LOG['chin_z'] = round(CHIN, 4); LOG['head_y'] = round(HY, 4)

PAL_ALL = {
    'a': {'skin': '#8ad86a', 'skinshade': '#6fbe55', 'skinlight': '#a0e281', 'cream': '#f3e8bc', 'creamshade': '#e0cf9a',
          'shirt': '#f3bc96', 'shirtlight': '#f8cba9', 'shirtshade': '#e3a47e', 'shirtdeep': '#cf8f6a',
          'over': '#64835a', 'overlight': '#76966b', 'overshade': '#557349', 'overdeep': '#465f3c',
          'button': '#f6ecd0', 'buttonshade': '#e2d3ae', 'leaf': '#64835a', 'leafshade': '#4e6d44', 'leaflight': '#7d9e6e'},
    'b': {'skin': '#6ac8a0', 'skinshade': '#52ae88', 'skinlight': '#80d6b0', 'cream': '#f3e8bc', 'creamshade': '#e0cf9a',
          'top': '#f0d58b', 'toplight': '#f6e1a6', 'topshade': '#dfc074', 'topdeep': '#c9aa60',
          'apron': '#fff1d8', 'apronlight': '#fff7e8', 'apronshade': '#ecdcbc', 'aprondeep': '#d8c6a2',
          'scarf': '#efa18d', 'scarflight': '#f6b5a3', 'scarfshade': '#dc8a76', 'scarfdeep': '#c47562'},
    'c': {'skin': '#b8e070', 'skinshade': '#9cc858', 'skinlight': '#c8ea88', 'cream': '#f3e8bc', 'creamshade': '#e0cf9a',
          'smock': '#9ccbdf', 'smocklight': '#b0d8ea', 'smockshade': '#86b6cc', 'smockdeep': '#70a0b6',
          'collar': '#fff1d8', 'collarshade': '#ecdcbc', 'collarlight': '#fff7ea',
          'bag': '#b4a0cf', 'baglight': '#c4b2dc', 'bagshade': '#9e8aba', 'bagdeep': '#8a76a6'},
}
PAL = dict(PAL_ALL[DESIGN])
PAL.update({'blush': '#efa398', 'lash': '#302b25', 'brow': '#3a2e24', 'mouth': '#302b25', 'nostril': '#302b25',
            'iris0': '#a56d45', 'iris1': '#8a5636', 'iris2': '#75472f', 'iris3': '#5a3522', 'pupil': '#33231a',
            'sclera': '#fff4e2', 'line': PAL['skinshade']})

# 2048 atlas charts (x, y, w, h) in pixels, y up (Blender UV convention). The lid / cavity / tongue charts are reserved
# for the phase-2 rig (painted plain skin now).
CHARTS = {'head': (0, 768, 1280, 1280), 'headback': (1280, 1280, 768, 768),
          'eye.L': (1280, 896, 384, 384), 'eye.R': (1664, 896, 384, 384),
          'x1': (1280, 640, 384, 256), 'x2': (1664, 640, 384, 256),
          'torso': (0, 384, 512, 384), 'sleeve': (512, 384, 512, 384), 'pants': (1024, 512, 256, 256), 'bib': (1024, 256, 256, 256),
          'skin': (512, 128, 512, 256), 'paw': (1024, 0, 256, 256), 'foot': (1280, 384, 384, 256), 'x3': (1664, 384, 384, 256),
          'band': (1280, 192, 256, 192), 'knot': (1280, 0, 256, 192), 'cuff': (1536, 0, 256, 384),
          'ramp': (1792, 0, 256, 256), 'lash': (1792, 256, 256, 128),
          'lidU.L': (0, 256, 256, 128), 'lidU.R': (256, 256, 256, 128), 'lidD.L': (0, 128, 128, 128), 'lidD.R': (128, 128, 128, 128),
          'cavity': (256, 128, 128, 128), 'tongue': (384, 128, 128, 128)}

def rgb(c):
    h = PAL.get(c, c).lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
def clamp(x): return np.clip(x, 0, 1)
def smooth(a, b, x):
    t = clamp((np.asarray(x, dtype=float) - a) / (b - a)); return t * t * (3 - 2 * t)
def mix(a, b, t):
    t = np.asarray(t, dtype=float)
    return np.asarray(a) * (1 - t[..., None]) + np.asarray(b) * t[..., None]
def spow(x, p): return np.sign(x) * np.abs(x) ** p
def au(chart, u, v):
    x, y, w, h = CHARTS[chart]; g = 6
    return ((x + g + u * (w - 2 * g)) / 2048, (y + g + v * (h - 2 * g)) / 2048)
def unit(v): return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)
smin = FH.smin
def smax(a, b, k): return -smin(-a, -b, k)
sell = FH.sell
def rot_x(t): return np.array([[1, 0, 0], [0, math.cos(t), -math.sin(t)], [0, math.sin(t), math.cos(t)]])
def rot_z(t): return np.array([[math.cos(t), -math.sin(t), 0], [math.sin(t), math.cos(t), 0], [0, 0, 1]])

# ramps (1-D shading rows in the 'ramp' chart) for the SDF-meshed pieces (the leaf cap, the neckerchief)
RAMPS = {'a': {'leaf': ('leafshade', 'leaf', 'leaflight')}, 'b': {'scarf': ('scarfshade', 'scarf', 'scarflight')}, 'c': {}}[DESIGN]
RAMPS['skinr'] = ('skinshade', 'skin', 'skinlight')
RAMP_ROWS = {k: i for i, k in enumerate(RAMPS)}
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

# ============================================================== the head (implicit, metres)
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
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
def front_hit(x, z, f=head_sdf):
    """metres in, metres out"""
    return HY + W * front_local(np.asarray(x) / W, (np.asarray(z) - CHIN) / W, lambda q: f(L2M(q)) / W)
O = np.array([0, HY, CHIN + .33 * W])                 # every ray from here meets the skin once
def radial_hit(d, f=head_sdf, o=O, t0=.02, t1=.75, it=34):
    lo = np.full(len(d), t0); hi = np.full(len(d), t1)
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
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
def grad(f, p, e=1.5e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
def grad_n(p, f=head_sdf, e=1.5e-4): return grad(f, p, e)
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

# ============================================================== face layout (front projection, metres; sheet-measured)
_ex, _ez, _ehw, _ehh = CFG['EYE']
EX = _ex * W; EZ = CHIN + _ez * W; EHW = _ehw * W; EHH = _ehh * W; EN = 2.1
def eye_unit(psi):
    c = np.cos(psi); s = np.sin(psi)
    return spow(c, 2 / EN), spow(s, 2 / EN)
def eye_xz(side, psi, k=1.0):
    ux, uz = eye_unit(psi); return side * EX + side * EHW * k * ux, EZ + EHH * k * uz
def eye_s(side, x, z):
    X = side * (np.asarray(x) - side * EX) / EHW; Z = (np.asarray(z) - EZ) / EHH
    return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
def lid_edge_Z(X): return 1.25 + 0 * np.asarray(X, float)      # open eyes: no rest lid over the lens (the rig adds the lids)
_mp = np.array(CFG['MOUTH'], float); _mp = np.vstack([_mp, [(-x, z) for x, z in _mp[-2::-1]]])
def mouth_curve(u):           # u in [-1, 1] -> (x, z) W
    t = np.linspace(-1, 1, len(_mp))
    return np.stack([np.interp(u, t, _mp[:, 0]), np.interp(u, t, _mp[:, 1])], -1)
MHW = abs(_mp[0, 0]) * W; MZK = _mp[0, 1]; MC = CHIN + _mp[len(_mp) // 2, 1] * W
BROW_X = CFG['BROW'][0] * W; BROW_Z = CHIN + CFG['BROW'][1] * W
BLUSH = (CFG['BLUSH'][0] * W, CHIN + CFG['BLUSH'][1] * W, CFG['BLUSH'][2] * W, CFG['BLUSH'][3] * W)

# ============================================================== geometry helpers
GROUPS = ['head', 'eye.L', 'eye.R', 'lash.L', 'lash.R', 'cap', 'scarf', 'scarf_ends', 'body', 'bag', 'arm.L', 'arm.R', 'leg.L', 'leg.R']
parts = {k: [] for k in GROUPS}
def mesh(name, verts, faces, uvs, chart, group, raw_uv=False, sharp=None, normals=None, recalc=True):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(int(i) for i in f) for f in faces]); me.update()
    uv = me.uv_layers.new(name='Atlas')
    for p, coords in zip(me.polygons, uvs):
        p.use_smooth = True
        for li, co in zip(p.loop_indices, coords): uv.data[li].uv = tuple(co) if raw_uv else au(chart, *co)
    bm = bmesh.new(); bm.from_mesh(me)
    if recalc: bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if sharp:
        sv = set(sharp)
        for e in bm.edges:
            if e.verts[0].index in sv and e.verts[1].index in sv: e.smooth = False
    bm.to_mesh(me); bm.free()
    if normals is not None:
        a = me.attributes.new('cust_n', 'FLOAT_VECTOR', 'POINT')
        nn_ = np.asarray(normals, float); ln_ = np.linalg.norm(nn_, axis=-1, keepdims=True)
        a.data.foreach_set('vector', np.where(ln_ > 1e-9, nn_ / np.maximum(ln_, 1e-9), 0.).astype(np.float32).ravel())
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    parts[group].append(ob); return ob
def make_obj(name, V, F, UV, group, N=None, recalc=True):
    """UV: per-vertex array (len V, atlas coords)"""
    V = np.asarray(V, float)
    me = bpy.data.meshes.new(name); me.from_pydata(V.tolist(), [], [tuple(int(i) for i in f) for f in F]); me.update()
    uvl = me.uv_layers.new(name='Atlas')
    lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    uvl.data.foreach_set('uv', np.asarray(UV, float)[lv].astype(np.float32).ravel())
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    if recalc:
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    if N is not None:
        a = me.attributes.new('cust_n', 'FLOAT_VECTOR', 'POINT')
        a.data.foreach_set('vector', unit(np.asarray(N, float)).astype(np.float32).ravel())
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    parts[group].append(ob); return ob
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
def sdf_ball(name, f, centre, n, group, ramp, scale=(1, 1, 1), shade=None, t1=.8, orient=None):
    """mesh the zero set of f by radial projection of a cube-sphere from centre (analytic normals, ramp UVs)"""
    D, F = cube_sphere(n); D = D * np.asarray(scale, float)
    if orient is not None: D = D @ np.asarray(orient, float).T
    D = unit(D)
    P = ray_outer(f, centre, D, t1=t1); N = grad(f, P)
    val = shade(P, N) if shade is not None else sval(N)
    return make_obj(name, P, F, ramp_uv(ramp, val), group, N), P, N

def blob(name, center, radii, chart, group, seg=24, rows=14, p=(1., 1., 1.), orient=None, vrange=(0., 1.)):
    """superellipsoid (exponents p on sin/cos), UV u = azimuth (front -Y at u = .5), v = bottom -> top"""
    c = Vector(center); rx, ry, rz = radii
    def point(u, v):
        a = 2 * PI * u; ph = PI * v
        q = Vector((rx * spow(math.sin(ph), p[0]) * spow(math.sin(a), p[0]), ry * spow(math.sin(ph), p[1]) * spow(math.cos(a), p[1]),
                    -rz * spow(math.cos(ph), p[2])))
        if orient: q = orient @ q
        return tuple(c + q)
    verts = [point(.5, 0)]
    for j in range(1, rows):
        for i in range(seg): verts.append(point(i / seg, j / rows))
    top = len(verts); verts.append(point(.5, 1)); faces = []; uvs = []
    ix = lambda j, i: 1 + (j - 1) * seg + i % seg
    V = lambda t: vrange[0] + (vrange[1] - vrange[0]) * t
    for i in range(seg):
        faces.append((0, ix(1, i + 1), ix(1, i))); uvs.append((((i + .5) / seg, V(0)), ((i + 1) / seg, V(1 / rows)), (i / seg, V(1 / rows))))
    for j in range(1, rows - 1):
        for i in range(seg):
            faces.append((ix(j, i), ix(j, i + 1), ix(j + 1, i + 1), ix(j + 1, i)))
            uvs.append(((i / seg, V(j / rows)), ((i + 1) / seg, V(j / rows)), ((i + 1) / seg, V((j + 1) / rows)), (i / seg, V((j + 1) / rows))))
    for i in range(seg):
        faces.append((ix(rows - 1, i), ix(rows - 1, i + 1), top)); uvs.append(((i / seg, V((rows - 1) / rows)), ((i + 1) / seg, V((rows - 1) / rows)), ((i + .5) / seg, V(1))))
    return mesh(name, verts, faces, uvs, chart, group)

def catmull(points, t):
    pts = [Vector(p) for p in points]; n = len(pts) - 1; k = min(int(t * n), n - 1); f = t * n - k
    p0, p1, p2, p3 = pts[max(0, k - 1)], pts[k], pts[k + 1], pts[min(n, k + 2)]
    return .5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)

def sweep(name, path, radius, chart, group, rings=20, sides=16, caps=(True, True), vrange=(0., 1.), ovals=None, ref0=None):
    """a tube along a dense polyline (arc-length rings, parallel-transport frames); radius(s, L) in metres;
    ovals(s, L) -> (kx, ky) stretches the section"""
    P = np.array([list(p) for p in path], float); seglen = np.linalg.norm(np.diff(P, axis=0), axis=1)
    S = np.concatenate([[0], np.cumsum(seglen)]); L = S[-1]
    ss = np.linspace(0, L, rings + 1) if not callable(rings) else rings(L)
    verts = []; faces = []; uvs = []; old = None; centres = []
    for j, s in enumerate(ss):
        p = np.array([np.interp(s, S, P[:, k]) for k in range(3)])
        s0, s1 = max(0, s - .004), min(L, s + .004)
        d = np.array([np.interp(s1, S, P[:, k]) for k in range(3)]) - np.array([np.interp(s0, S, P[:, k]) for k in range(3)])
        d = d / np.linalg.norm(d)
        if old is None:
            ref = np.asarray(ref0, float) if ref0 is not None else (np.array([0, 1., 0]) if abs(d[1]) < .95 else np.array([1., 0, 0]))
            x = np.cross(d, ref); x /= np.linalg.norm(x)
        else:
            x = old - d * (old @ d); x /= np.linalg.norm(x)
        y = np.cross(d, x); old = x; r = radius(s, L); kx, ky = ovals(s, L) if ovals else (1, 1)
        centres.append(p)
        for i in range(sides):
            a = 2 * PI * i / sides; verts.append(tuple(p + x * (r * kx * math.cos(a)) + y * (r * ky * math.sin(a))))
    nr = len(ss) - 1
    V = lambda t: vrange[0] + (vrange[1] - vrange[0]) * t
    for j in range(nr):
        for i in range(sides):
            n = (i + 1) % sides; faces.append((j * sides + i, j * sides + n, (j + 1) * sides + n, (j + 1) * sides + i))
            uvs.append(((i / sides, V(ss[j] / L)), ((i + 1) / sides, V(ss[j] / L)), ((i + 1) / sides, V(ss[j + 1] / L)), (i / sides, V(ss[j + 1] / L))))
    for end, j in ((0, 0), (1, nr)):
        if not caps[end]: continue
        k = len(verts); verts.append(tuple(centres[j]))
        for i in range(sides):
            a, b = j * sides + i, j * sides + (i + 1) % sides
            faces.append((k, b, a) if end == 0 else (k, a, b)); uvs.append(((.5, V(ss[j] / L)), (i / sides, V(ss[j] / L)), ((i + 1) / sides, V(ss[j] / L))))
    return mesh(name, verts, faces, uvs, chart, group), L

def lathe(name, rows, chart, group, N=64, n=2.0, cap=(False, False), vrange=(0., 1.)):
    """ring surface: rows of (z, ax, ay[, yc[, xc]]); superellipse sections (exponent n); front (-Y) at u = .5"""
    verts = []; faces = []; uvs = []; M = len(rows)
    for j, row in enumerate(rows):
        z, ax, ay = row[:3]; yc = row[3] if len(row) > 3 else 0.; xc = row[4] if len(row) > 4 else 0.
        for i in range(N):
            a = 2 * PI * i / N
            verts.append((xc + ax * spow(math.sin(a), 2 / n), yc + ay * spow(math.cos(a), 2 / n), z))
    V = lambda t: vrange[0] + (vrange[1] - vrange[0]) * t
    for j in range(M - 1):
        for i in range(N):
            ni = (i + 1) % N; faces.append((j * N + i, j * N + ni, (j + 1) * N + ni, (j + 1) * N + i))
            uvs.append(((i / N, V(j / (M - 1))), ((i + 1) / N, V(j / (M - 1))), ((i + 1) / N, V((j + 1) / (M - 1))), (i / N, V((j + 1) / (M - 1)))))
    for end, j in ((0, 0), (1, M - 1)):
        if not cap[end]: continue
        row = rows[j]; k = len(verts); z = row[0]; yc = row[3] if len(row) > 3 else 0.; xc = row[4] if len(row) > 4 else 0.; verts.append((xc, yc, z))
        for i in range(N):
            faces.append((k, j * N + i, j * N + (i + 1) % N)); uvs.append(((.5, V(j / (M - 1))), (i / N, V(j / (M - 1))), ((i + 1) / N, V(j / (M - 1)))))
    return mesh(name, verts, faces, uvs, chart, group)

class Surf:
    """a lathe-type body surface (rows (z, ax, ay) sorted by z, a constant centre yc): points by azimuth (a = pi is the
    front, pi/2 his left side), front / back depth, the outward normal, and the azimuth of a point given x"""
    def __init__(self, rows, n, yc=0.):
        r = sorted(rows, key=lambda q: q[0]); self.Z = np.array([q[0] for q in r]); self.AX = np.array([q[1] for q in r])
        self.AY = np.array([q[2] for q in r]); self.n = n; self.yc = yc
    def ax(self, z): return np.interp(z, self.Z, self.AX)
    def ay(self, z): return np.interp(z, self.Z, self.AY)
    def pt(self, a, z):
        a = np.asarray(a, float); z = np.asarray(z, float)
        return np.stack([self.ax(z) * spow(np.sin(a), 2 / self.n), self.yc + self.ay(z) * spow(np.cos(a), 2 / self.n), z + 0 * a], -1)
    def field(self, P):
        return (np.abs(P[:, 0] / self.ax(P[:, 2])) ** self.n + np.abs((P[:, 1] - self.yc) / self.ay(P[:, 2])) ** self.n) ** (1 / self.n) - 1
    def normal(self, P):
        P = np.atleast_2d(np.asarray(P, float)); g = np.zeros_like(P)
        for k in range(3):
            dp = np.zeros(3); dp[k] = 1e-4; g[:, k] = self.field(P + dp) - self.field(P - dp)
        return unit(g)
    def front(self, x, z):
        return self.yc - self.ay(z) * np.clip(1 - np.abs(np.asarray(x) / self.ax(z)) ** self.n, 0, 1) ** (1 / self.n)
    def back(self, x, z):
        return self.yc + self.ay(z) * np.clip(1 - np.abs(np.asarray(x) / self.ax(z)) ** self.n, 0, 1) ** (1 / self.n)
    def az(self, x, z, front=True):
        t = float(np.clip(abs(x) / self.ax(z), 0, 1)) ** (self.n / 2); a = math.asin(t)
        if front: return PI - a if x >= 0 else PI + a
        return a if x >= 0 else 2 * PI - a

def strip(name, C, N, half_w, thick, chart, group, nsec=9, embed=.0015):
    """a rounded band lying on a surface: centre points C on the surface, surface normals N, a half-lens section with
    a flat underside (slightly embedded); UV u = across, v = along (arc length)"""
    C = np.asarray(C, float); N = unit(np.asarray(N, float)); M = len(C)
    T = np.gradient(C, axis=0); T = unit(T - N * (T * N).sum(1, keepdims=True)); S = unit(np.cross(N, T))
    hw = np.broadcast_to(np.asarray(half_w, float), (M,)); th = np.broadcast_to(np.asarray(thick, float), (M,))
    sl = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]); sl = sl / sl[-1]
    verts = []; faces = []; uvs = []
    for j in range(M):
        for i in range(nsec):
            a = PI * i / (nsec - 1)
            verts.append(tuple(C[j] + S[j] * (hw[j] * math.cos(a)) + N[j] * (th[j] * math.sin(a) ** .7 - embed)))
    for j in range(M - 1):
        for i in range(nsec - 1):
            faces.append((j * nsec + i, j * nsec + i + 1, (j + 1) * nsec + i + 1, (j + 1) * nsec + i))
            uvs.append(((i / (nsec - 1), sl[j]), ((i + 1) / (nsec - 1), sl[j]), ((i + 1) / (nsec - 1), sl[j + 1]), (i / (nsec - 1), sl[j + 1])))
        faces.append((j * nsec + nsec - 1, j * nsec, (j + 1) * nsec, (j + 1) * nsec + nsec - 1))
        uvs.append(((1, sl[j]), (0, sl[j]), (0, sl[j + 1]), (1, sl[j + 1])))
    for j in (0, M - 1):
        faces.append(tuple(range(j * nsec, j * nsec + nsec))); uvs.append(tuple((.5, sl[j]) for _ in range(nsec)))
    return mesh(name, verts, faces, uvs, chart, group)

def thick_panel(name, MID, N, T, chart, group, uarr, varr, rim_n=3, front_extra=None):
    """a thick panel: back face T/2 behind the mid surface, front face T/2 (+ front_extra per vertex) in front, rounded rim"""
    nr, nc = MID.shape[:2]; FE = np.zeros((nr, nc)) if front_extra is None else front_extra
    Fr = MID + N * (T / 2 + FE[..., None]); Bk = MID - N * T / 2
    verts = []; faces = []; uvs = []
    def vid(arr_i, i, j): return arr_i * nr * nc + i * nc + j
    for arr in (Fr, Bk):
        for i in range(nr):
            for j in range(nc): verts.append(tuple(arr[i, j]))
    for side, arr_i in ((0, 0), (1, 1)):
        for i in range(nr - 1):
            for j in range(nc - 1):
                f = (vid(arr_i, i, j), vid(arr_i, i, j + 1), vid(arr_i, i + 1, j + 1), vid(arr_i, i + 1, j))
                faces.append(f if side == 0 else f[::-1])
                q = ((uarr[j], varr[i]), (uarr[j + 1], varr[i]), (uarr[j + 1], varr[i + 1]), (uarr[j], varr[i + 1]))
                q = tuple((.04 + .92 * a, .30 + .70 * b) if side == 0 else (.04 + .92 * a, .02 + .20 * b) for a, b in q)
                uvs.append(q if side == 0 else q[::-1])
    loop = [(0, j) for j in range(nc)] + [(i, nc - 1) for i in range(1, nr)] + [(nr - 1, j) for j in range(nc - 2, -1, -1)] + [(i, 0) for i in range(nr - 2, 0, -1)]
    L = len(loop); rings = []
    for (i, j) in loop:
        n = N[i, j]; c = MID[i, j]
        ii_ = min(max(i, 1), nr - 2); jj_ = min(max(j, 1), nc - 2)
        e = c - MID[ii_, jj_]
        if i == 0 or i == nr - 1: e = e + (MID[i, j] - MID[1 if i == 0 else nr - 2, j]) * 2
        if j == 0 or j == nc - 1: e = e + (MID[i, j] - MID[i, 1 if j == 0 else nc - 2]) * 2
        e = e - n * (e @ n); e = e / (np.linalg.norm(e) + 1e-12)
        ring = []
        for k in range(1, rim_n):
            th_ = PI * k / rim_n
            hT = (T + FE[i, j]) / 2; cc = c + n * (FE[i, j] / 2)
            ring.append(len(verts)); verts.append(tuple(cc + n * hT * math.cos(th_) + e * hT * .9 * math.sin(th_)))
        rings.append(ring)
    for a in range(L):
        b = (a + 1) % L; (ia, ja), (ib, jb) = loop[a], loop[b]
        colA = [vid(0, ia, ja)] + rings[a] + [vid(1, ia, ja)]; colB = [vid(0, ib, jb)] + rings[b] + [vid(1, ib, jb)]
        for k in range(len(colA) - 1):
            faces.append((colA[k], colB[k], colB[k + 1], colA[k + 1])); uvs.append(((.5, .26), (.5, .26), (.5, .26), (.5, .26)))
    return mesh(name, verts, faces, uvs, chart, group)
def panel_grid(surf, x_of, zr, nc, rc, gap, T, side=-1, hang=False):
    """mid surface of a rounded-corner panel on a Surf: rows zr (bottom -> top), half-width x_of(z), corner radius rc at the
    bottom (rc > 0) or the top (rc < 0); hang: the panel never tucks back in below (it hangs straight down)"""
    zr = np.asarray(zr, float); hw = np.array([x_of(z) for z in zr])
    r = abs(rc)
    if rc > 0: dz = np.clip((zr[0] + r) - zr, 0, r)
    else: dz = np.clip(zr - (zr[-1] - r), 0, r)
    hw = hw - r + np.sqrt(np.maximum(r * r - dz * dz, 0))
    cr = np.sin(np.linspace(-PI / 2, PI / 2, nc))
    X = cr[None, :] * hw[:, None]; Z = np.repeat(zr[:, None], nc, 1)
    Y = surf.front(X, Z) if side < 0 else surf.back(X, Z)
    if hang and side < 0:
        for i in range(len(zr) - 2, -1, -1): Y[i] = np.minimum(Y[i], Y[i + 1])
    S0 = np.stack([X, Y, Z], -1); Nn = surf.normal(S0.reshape(-1, 3)).reshape(S0.shape)
    if hang: Nn = unit(Nn * np.array([1, 1, .35]))
    MID = S0 + Nn * (gap + T / 2)
    dzA = np.gradient(MID, axis=0); dxA = np.gradient(MID, axis=1)
    NA = unit(np.cross(dzA, dxA)); NA = np.where(((NA[..., 1:2] * side) < 0), -NA, NA)
    return MID, NA, (cr + 1) / 2, (zr - zr[0]) / (zr[-1] - zr[0])
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

# ============================================================== HEAD SKIN: CDT on the ball, eyelid / mouth loops
pts = []; cons = []; tags = {}
def add_loop(P, tag, closed=True):
    i0 = len(pts); pts.extend([tuple(p) for p in P]); n = len(P)
    for i in range(n if closed else n - 1): cons.append((i0 + i, i0 + (i + 1) % n))
    tags[tag] = list(range(i0, i0 + n)); return tags[tag]
def surf_dir(x, z):
    y = front_hit(x, z); return unit(np.stack([np.asarray(x, float) * np.ones_like(y), y, np.asarray(z, float) * np.ones_like(y)], -1) - O)

NE = 40
EYE_SCALES = [1.0, 1.07, 1.15, 1.24, 1.34, 1.45]
eye_dom = {}
for s in (-1, 1):
    psi = np.linspace(0, 2 * PI, NE, endpoint=False)
    x, z = eye_xz(s, psi); base = to_dom(surf_dir(x, z)); c = to_dom(surf_dir(np.array([s * EX]), np.array([EZ])))[0]
    eye_dom[s] = (c, base)
    wn = (1 - .45 * smooth(-.10, -.80, np.cos(psi))) * (1 - .40 * smooth(-.2, -.9, np.sin(psi)))   # tighter toward the nose / mouth
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
# the smile: loops that follow its curve (above / below), the ends rounded
MOUTH_LOOPS = [(.012, .013, .015), (.022, .023, .027), (.033, .034, .040)]   # (end pad, above, below) W
for k, (pe, ha, hb) in enumerate(MOUTH_LOOPS):
    a = np.linspace(0, 2 * PI, 64, endpoint=False); u = np.cos(a)
    c_ = mouth_curve(np.clip(u, -1, 1)); xx = c_[:, 0] * (1 + pe / (MHW / W) * np.abs(u) ** 6); zz = c_[:, 1] + np.where(np.sin(a) > 0, ha, hb) * np.sin(a)
    add_loop(to_dom(surf_dir(xx * W, CHIN + zz * W)), 'mouth_%d' % k)
NB = 12; AB = math.radians(176)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
# fill: a dense Fibonacci set of directions thinned to a spacing field (fine on the face band and the domes' fillet,
# medium on the crown, coarser on the back), deterministic greedy order; the 22k townsfolk budget
GS = W / .623
NF = 60000; ii = np.arange(NF) + .5
phi = np.arccos(1 - 2 * ii / NF); th = PI * (1 + 5 ** .5) * ii
D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1)); D = D[alpha < math.radians(173.5)]
Pf = radial_hit(D); q = M2L(Pf)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1))
fband = smooth(.52, .42, np.abs(q[:, 0])) * smooth(.10, .16, q[:, 2]) * smooth(.72, .64, q[:, 2]) * smooth(math.radians(82), math.radians(68), alpha)
fil = smooth(.050, .015, np.abs(skull_local(q) - dome_local(q))) * smooth(.40, .50, q[:, 2])
hsp = (.0240 + (.0460 - .0240) * smooth(math.radians(100), math.radians(125), alpha)) * GS
hsp = hsp * (1 - fband) + .0138 * GS * fband
hsp = np.minimum(hsp, hsp * (1 - fil) + .0150 * GS * fil)
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
def eye_ring_rr(dp):
    best = np.full(len(dp), 9.)
    for s in (-1, 1):
        c, base = eye_dom[s]
        outer = np.array([pts[i] for i in tags['eye%d_%d' % (s, len(EYE_SCALES) - 1)]])
        ang_b = np.arctan2(outer[:, 1] - c[1], outer[:, 0] - c[0]); rad_b = np.linalg.norm(outer - c, axis=1)
        order_ = np.argsort(ang_b); ab = np.concatenate([ang_b[order_] - 2 * PI, ang_b[order_], ang_b[order_] + 2 * PI]); rb = np.tile(rad_b[order_], 3)
        v = dp - c; best = np.minimum(best, np.linalg.norm(v, axis=1) / np.interp(np.arctan2(v[:, 1], v[:, 0]), ab, rb))
    return best
def in_poly(P, poly):
    x = P[:, 0]; y = P[:, 1]; inside = np.zeros(len(P), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        inside ^= ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1)
    return inside
keep = eye_ring_rr(dom) > 1.06
frontp = Pf[:, 1] < HY
_mo = np.array([pts[i] for i in tags['mouth_%d' % (len(MOUTH_LOOPS) - 1)]])
keep &= ~(frontp & in_poly(dom, _mo))
_dm = np.min(np.linalg.norm(dom[:, None, :] - _mo[None, ::2, :], axis=2), axis=1)
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
        verts.append(tuple(P - .0045 * SW * n + .0016 * SW * t)); vdir.append(vdir[vi]); vnorm.append(n); rr.append(i0 + k)   # the roll keeps the skin's normal (no grey ring)
    for k in range(NE):
        faces.append((rim[k], rim[(k + 1) % NE], rr[(k + 1) % NE], rr[k]))
    roll_info[s] = (rim, rr)
RIM_L = np.array([verts[i] for i in roll_info[1][0]])
vdir = unit(np.array(vdir)); vnorm = np.array(vnorm)
fuv = head_uv(vdir); buv = headback_uv(vdir)
face_uvs = []
for f in faces:
    a = math.acos(float(np.clip(-vdir[list(f)].mean(0)[1] / np.linalg.norm(vdir[list(f)].mean(0)), -1, 1)))
    if a < A_SPLIT: face_uvs.append(tuple(tuple(au('head', *fuv[i])) for i in f))
    else: face_uvs.append(tuple(tuple(au('headback', *buv[i])) for i in f))
skin = mesh('frog_head_skin', verts, faces, face_uvs, 'head', 'head', raw_uv=True, normals=vnorm)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)
_vv = np.array(verts[:len(skin_p)]); LOG['skin_fold_vertices'] = int((((_vv - O) * skin_n).sum(1) < 0).sum())

# ============================================================== EYES: flush lens globes following the head
ES = [0, .12, .25, .38, .51, .63, .74, .84, .92, .98, 1.10]
NSEG = 28
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

# ============================================================== LASH RIBBONS: the upper lash line + one wing flick
# The sheet: ~0.017 W thick over the top, ~0.025 W at the outer upper corner, running down the outer side to ~0.4 of the
# half-height below the eye's middle, one short wing flick at the outer upper corner pointing out. A flattened tapered
# tube lying on the skin, its inner edge just inside the lid hole. Separate objects (origin at the eye centre) for the lids.
LASH_PSI = np.radians(np.linspace(160, -45, 30))         # inner top -> over the top -> down the outer side
LTH0, LTH1 = CFG['LASH']
def lash_th(psi):      # thickness in eye-radius units (the opening's superellipse radius)
    d = np.degrees(psi)
    th = LTH0 + LTH1 * np.exp(-((d - 35) / 32) ** 2)
    th = th * (1 - .55 * smooth(22, -38, d))
    return th * smooth(162, 130, d) * smooth(-48, -8, d) + .02
LASH_WINGS = [CFG['WING']]
def eye_pt(s, X, Z):
    """eye units (X > 0 outer) -> skin point, its normal"""
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S = np.stack([x, y, z], -1); return S, grad_n(S)
def ribbon(C, n, hw, hp, NLS=8, embed=.0012 * W):
    """flattened lens-section tube along skin points C with skin normals n; returns verts, faces, normals"""
    tg = np.gradient(C, axis=0); tg = unit(tg - n * (tg * n).sum(1, keepdims=True)); sd = unit(np.cross(n, tg))
    V = []; NV = []; NT = len(C)
    for i in range(NT):
        for k in range(NLS):
            a = 2 * PI * k / NLS; ca, sa = math.cos(a), math.sin(a)
            up = hp[i] * (sa if sa > 0 else .40 * sa)
            V.append(C[i] + sd[i] * hw[i] * ca + n[i] * (up - embed))
            NV.append(unit(sd[i] * ca / max(hw[i], 1e-4) + n[i] * sa / max(hp[i], 1e-4)))
    V = np.array(V); NV = np.array(NV)
    tip = len(V); V = np.vstack([V, C[-1] + tg[-1] * hw[-1] * .7 + n[-1] * (.2 * hp[-1] - embed)]); NV = np.vstack([NV, tg[-1]])
    root = len(V); V = np.vstack([V, C[0] - tg[0] * hw[0] * .7 + n[0] * (.2 * hp[0] - embed)]); NV = np.vstack([NV, -tg[0]])
    F = []
    for i in range(NT - 1):
        for k in range(NLS):
            a_, b_ = i * NLS + k, i * NLS + (k + 1) % NLS; F.append((a_, b_, b_ + NLS, a_ + NLS))
    for k in range(NLS): F.append(((NT - 1) * NLS + k, (NT - 1) * NLS + (k + 1) % NLS, tip))
    for k in range(NLS): F.append(((k + 1) % NLS, k, root))
    return V, F, NV, NLS
lash_info = {}
for s, tag in ((-1, 'R'), (1, 'L')):
    th = lash_th(LASH_PSI); k_in = .965
    ux, uz = eye_unit(LASH_PSI)
    Pin, _ = eye_pt(s, ux * k_in, uz * k_in); Pout, _ = eye_pt(s, ux * (k_in + th), uz * (k_in + th))
    Cm, nm = eye_pt(s, ux * (k_in + th / 2), uz * (k_in + th / 2))
    hw = np.linalg.norm(Pout - Pin, axis=1) / 2
    tt = np.linspace(0, 1, len(LASH_PSI))
    hp = (.0080 * W) * (.55 + .45 * smooth(0, .25, tt)) * (1 - .55 * smooth(.70, 1.0, tt))
    V, F, NV, NLS = ribbon(Cm, nm, hw, hp, NLS=7)
    allV = [V]; allF = [F]; allN = [NV]; off = len(V)
    for (rpsi, rk), (tx, tz) in LASH_WINGS:
        rp = math.radians(rpsi); rux, ruz = eye_unit(np.array([rp]))
        thr = lash_th(np.array([rp]))[0]
        R0 = np.array([rux[0] * (k_in + thr * .45), ruz[0] * (k_in + thr * .45)])
        T0 = np.array([tx, tz])
        mid = R0 + (T0 - R0) * .5 + np.array([-.02, .05])         # a slight upward curl
        ws = np.linspace(0, 1, 10)
        XZ = np.array([(1 - w) ** 2 * R0 + 2 * (1 - w) * w * mid + w * w * T0 for w in ws])
        Cw, nw = eye_pt(s, XZ[:, 0], XZ[:, 1])
        hww = (.0115 * W) * (1 - ws) ** .85 + .0012 * W
        hpw = (.0072 * W) * (1 - .72 * ws)
        Vw, Fw, NVw, _ = ribbon(Cw, nw, hww, hpw, NLS=6)
        allV.append(Vw); allF.append([tuple(i + off for i in f) for f in Fw]); allN.append(NVw); off += len(Vw)
    V = np.vstack(allV); NV = np.vstack(allN); F = [f for FF in allF for f in FF]
    ax_ = eye_axes[tag]; fac = clamp(.5 + .5 * (NV @ ax_))
    uvs = [tuple((.5, float(fac[i])) for i in f) for f in F]
    mesh('lash_line.' + tag, V, F, uvs, 'lash', 'lash.' + tag, normals=NV)
    lash_info[tag] = dict(top=[float(v) for v in Cm[np.argmax(Cm[:, 2])]], outer_end=[float(v) for v in Cm[-1]],
                          max_proud_W=round(float(hp.max() / W), 4), thick_top_W=round(float(2 * hw[np.argmax(Cm[:, 2])] / W), 4))
LOG['lash'] = lash_info

# ============================================================== BODY AND OUTFIT
joint_arms = {}; joint_legs = {}; EXTRA = {}
def arm_frame(s, Sh, ang, fwd):
    Dv = unit(np.array([s * math.sin(ang), -fwd, -math.cos(ang)]))
    Pv = unit(np.array([s * math.cos(ang), 0, math.sin(ang)])); Pv = unit(Pv - Dv * (Pv @ Dv)); Yv = -s * np.cross(Dv, Pv)
    return Dv, Pv, Yv
def build_arm(s, tag, Sh, ang, fwd, T0, T1, r0, r1, arm_r, t_paw, paw_r, nsl=18):
    grp = 'arm.' + tag
    Dv, Pv, Yv = arm_frame(s, Sh, ang, fwd)
    prof_s = []
    for t in np.linspace(T0, T1, 8):
        k = (t - T0) / (T1 - T0)
        a_ = r0 + (r1 - r0) * smooth(0, 1, k); prof_s.append((t, a_ * 1.04, a_ * .96))
    lip = [(T1 + .004, -.004), (T1 + .006, -.0095), (T1 + .003, -.015), (T1 - .004, -.017), (T1 - .030, -.018)]
    tl, al, bl = prof_s[-1]
    for (t, d) in lip: prof_s.append((t, al + d, bl + d))
    verts = []; faces = []; uvs = []; M = len(prof_s)
    for j, (t, a_, b_) in enumerate(prof_s):
        c = Sh + Dv * t
        for i in range(nsl):
            ph = 2 * PI * i / nsl
            verts.append(tuple(c + Pv * (a_ * spow(math.cos(ph), 2 / 2.4)) + Yv * (b_ * spow(math.sin(ph), 2 / 2.4))))
    for j in range(M - 1):
        for i in range(nsl):
            ni = (i + 1) % nsl; faces.append((j * nsl + i, j * nsl + ni, (j + 1) * nsl + ni, (j + 1) * nsl + i))
            uvs.append(((i / nsl, j / (M - 1)), ((i + 1) / nsl, j / (M - 1)), ((i + 1) / nsl, (j + 1) / (M - 1)), (i / nsl, (j + 1) / (M - 1))))
    k = len(verts); verts.append(tuple(Sh + Dv * prof_s[0][0]))
    for i in range(nsl): faces.append((k, i, (i + 1) % nsl)); uvs.append(((.5, 0), (i / nsl, 0), ((i + 1) / nsl, 0)))
    k = len(verts); verts.append(tuple(Sh + Dv * prof_s[-1][0]))
    for i in range(nsl): faces.append((k, (M - 1) * nsl + i, (M - 1) * nsl + (i + 1) % nsl)); uvs.append(((.5, 1), (i / nsl, 1), ((i + 1) / nsl, 1)))
    mesh('short_sleeve.' + tag, verts, faces, uvs, 'sleeve', grp)
    sweep('arm.' + tag, [Sh + Dv * t for t in np.linspace(.0, t_paw - .02, 8)], lambda s_, L: arm_r, 'skin', grp, rings=8, sides=20)
    orient = Matrix([list(Pv), list(Yv), list(Dv)]).transposed()
    blob('mitten_hand.' + tag, tuple(Sh + Dv * t_paw), paw_r, 'paw', grp, 22, 13, p=(.92, .92, .92), orient=orient)
    joint_arms[tag] = {'shoulder': [float(v) for v in Sh], 'elbow': [float(v) for v in Sh + Dv * (T1 * .9)],
                       'wrist': [float(v) for v in Sh + Dv * (t_paw - .045)], 'hand': [float(v) for v in Sh + Dv * t_paw],
                       'finger_tip': [float(v) for v in Sh + Dv * (t_paw + paw_r[2])]}
    return Sh + Dv * t_paw, Dv, Pv
def hand_clear(pc, Pv, paw_r, surf):
    """lateral clearance between the hand's inner side and the body's half-width at the hand's height (metres)"""
    return round(float(abs(pc[0]) - abs(Pv[0]) * paw_r[0] - surf.ax(pc[2])), 4)
def legs(xs, r, foot_c, foot_r, hip_z):
    for s, tg in ((-1, 'R'), (1, 'L')):
        grp = 'leg.' + tg; x0 = s * xs
        sweep('leg.' + tg, [(x0, 0., hip_z), (x0 + s * .003, -.003, (hip_z + .07) / 2), (x0 + s * .007, -.006, .065)], lambda s_, L: r, 'skin', grp, rings=7, sides=16)
        blob('foot.' + tg, (s * foot_c[0], foot_c[1], foot_c[2]), foot_r, 'foot', grp, 22, 12, p=(.82, .82, .78))
        joint_legs[tg] = {'hip': [x0, 0., hip_z], 'knee': [x0 + s * .003, -.003, (hip_z + .07) / 2], 'ankle': [x0 + s * .007, -.006, .065],
                          'foot': [s * foot_c[0], foot_c[1], foot_c[2]], 'toe': [s * foot_c[0], foot_c[1] - foot_r[1] * .9, .03]}

if DESIGN == 'a':
    YB = -.022                                    # the body's centre ahead of the leg axis (side view)
    # --- the peach shirt torso (hidden under the bibs and pants below z .46; the top tucks up inside the head)
    SHIRT = [(.380, .186, .170, YB), (.420, .184, .169, YB), (.460, .180, .166, YB), (.500, .174, .160, YB), (.540, .166, .152, YB),
             (.575, .154, .140, YB), (.605, .138, .126, YB), (.635, .118, .108, YB), (.665, .098, .090, YB)]
    lathe('shirt_torso', SHIRT, 'torso', 'body', 40, 2.3, cap=(False, True))
    torso = Surf([r[:3] for r in SHIRT], 2.3, YB)
    # --- the overall pants: a bean (sheet: half-width .18 at z .43, .22 at .36, .24 at .2-.28; depth +-.184) closing at
    # the crotch (z .19), with two separate trouser legs (half-width .116 at x +-.128) and rolled hems at z .137
    PANTS = [(.475, .174, .158), (.462, .184, .170), (.440, .192, .177), (.410, .205, .183), (.370, .217, .186), (.330, .226, .186),
             (.290, .233, .184), (.250, .237, .178), (.225, .236, .171), (.205, .226, .160), (.192, .196, .138), (.185, .140, .100), (.181, .060, .045)]
    lathe('overall_pants', [(z, ax, ay, YB) for (z, ax, ay) in PANTS], 'pants', 'body', 44, 2.3, cap=(False, True))
    pants = Surf(PANTS, 2.3, YB)
    LEG_X = .128
    CUFF = [(.265, .098, .108), (.230, .108, .118), (.190, .114, .124), (.160, .116, .126), (.146, .1165, .1265), (.139, .113, .122),
            (.1365, .107, .116), (.139, .100, .108), (.150, .096, .104)]
    for s, tg in ((-1, 'R'), (1, 'L')):
        lathe('trouser_leg.' + tg, [(z, ax, ay, YB * .5, s * LEG_X) for (z, ax, ay) in CUFF], 'cuff', 'body', 28, 2.2)
    # --- the bibs: thick panels lying on the outer of the shirt / pants (front top z .526, half-width .167; back top z .475)
    outer = Surf([(z, max(torso.ax(z), pants.ax(z) if z <= .475 else 0), max(torso.ay(z), pants.ay(z) if z <= .475 else 0)) for z in np.linspace(.36, .66, 31)], 2.3, YB)
    BIB_T, BIB_GAP = .011, .003
    BIB_F = panel_grid(outer, lambda z: .167 + (.185 - .167) * smooth(.47, .36, z), np.concatenate([np.linspace(.360, .500, 9), .500 + .026 * np.sin(np.linspace(0, 1, 7)[1:] * PI / 2)]),
                       13, -.028, BIB_GAP, BIB_T, -1)
    thick_panel('overall_bib_front', BIB_F[0], BIB_F[1], BIB_T, 'bib', 'body', BIB_F[2], BIB_F[3])
    BIB_B = panel_grid(outer, lambda z: .152 + (.180 - .152) * smooth(.45, .36, z), np.concatenate([np.linspace(.360, .440, 7), .440 + .035 * np.sin(np.linspace(0, 1, 7)[1:] * PI / 2)]),
                       13, -.040, BIB_GAP, BIB_T, 1)
    thick_panel('overall_bib_back', BIB_B[0], BIB_B[1], BIB_T, 'bib', 'body', BIB_B[2], BIB_B[3])
    # --- the straps: broad bands from the buttons (x +-.127, z .495) up over the shoulders and down the back (x +-.085)
    STRAP_HW, STRAP_T = .036, .009
    for s, tg in ((-1, 'R'), (1, 'L')):
        xf, xb = s * .127, s * .085
        zt = float(np.interp(.112 / .985, torso.AX[::-1], torso.Z[::-1]))          # where the torso narrows to the strap
        u = np.linspace(0, 1, 34)
        x = xf + (xb - xf) * smooth(.40, .60, u)
        a = np.array([torso.az(xi, .5, True) for xi in x[:17]] + [torso.az(xi, .5, False) for xi in x[17:]])
        zf = np.linspace(.490, zt - .004, 17); zb = np.linspace(zt - .004, .468, 17)
        z = np.concatenate([zf, zb])
        aa = np.array([torso.az(x[i], z[i], i < 17) for i in range(34)])
        C = torso.pt(aa, z); Nn = torso.normal(C)
        onbib = np.where(C[:, 1] < YB, smooth(.530, .520, C[:, 2]), smooth(.478, .470, C[:, 2]))
        C = C + Nn * (BIB_GAP + BIB_T * onbib + .0005)[:, None]
        strip('overall_strap.' + tg, C, Nn, STRAP_HW, STRAP_T, 'band', 'body', nsec=9, embed=.002)
        # the back strap ends: rounded tabs on the back bib
        Pt = C[-1]; nb = Nn[-1]; txv = unit(np.cross(np.array([0, 0, 1.]), nb)); tyv = np.cross(nb, txv)
        blob('strap_tab.' + tg, tuple(Pt + nb * (STRAP_T * .55) - tyv * .006), (.040, .028, .010), 'band', 'body', 14, 7, p=(.6, .6, .55),
             orient=Matrix([list(txv), list(tyv), list(nb)]).transposed())
    # --- the buttons: two big cream domes at the straps' front ends (sheet: d .068 m at x +-.12, z .495)
    for s, tg in ((-1, 'R'), (1, 'L')):
        x = s * .121; zb_ = .497; y = float(outer.front(x, zb_)); Sb = np.array([x, y, zb_]); nb = outer.normal(Sb)[0]
        txv = unit(np.cross(np.array([0, 0, 1.]), nb)); tyv = np.cross(nb, txv)
        c = Sb + nb * (BIB_GAP + BIB_T + STRAP_T * .6 + .006)
        blob('overall_button.' + tg, tuple(c), (.034, .034, .0125), 'knot', 'body', 16, 8, p=(.85, .85, .55),
             orient=Matrix([list(txv), list(tyv), list(nb)]).transposed())
    # --- arms: short peach sleeves, green capsule arms, mitten hands (35 deg out; the pants are wide at the hands' height)
    for s, tg in ((-1, 'R'), (1, 'L')):
        PAW_R = (.062, .052, .074)
        pc, Dv, Pv = build_arm(s, tg, np.array([s * .166, YB + .004, .566]), math.radians(35), .10, -.050, .088, .060, .070, .045, .212, PAW_R)
        LOG['hand_clear_body_' + tg] = hand_clear(pc, Pv, PAW_R, Surf([(z, max(pants.ax(z), torso.ax(z) if z > .475 else 0), .2) for z in np.linspace(.2, .66, 24)], 2.3))
    legs(.128, .080, (.145, -.033, .050), (.110, .140, .050), .200)
    HIPS = [0, 0., .225]
    # --- the leaf cap: a thick curved leaf (a disc grid mapped to a leaf outline, its edges drooping like a beret, a
    # thicker middle, a rounded rim) with a raised rib and a curled stem, sitting high in the valley between the domes
    CAP_C = np.array([0., HY - .004, CHIN + .735 * W])
    CAP_R = rot_z(math.radians(-14)) @ rot_x(math.radians(5))          # columns: v (across), u (long, toward the back), w (up)
    HL, HWv, CAP_K = .128, .116, 4.4
    def leaf_mid(u, v): return CAP_C + (np.stack([v, u, -CAP_K * (v * v + 1.05 * u * u) + .006], -1) @ CAP_R.T)
    NG = 17; ga = np.linspace(-1, 1, NG); A_, B_ = np.meshgrid(ga, ga, indexing='ij')         # rows: b (across), cols: a (long)
    du_ = A_ * np.sqrt(1 - B_ ** 2 / 2); dv_ = B_ * np.sqrt(1 - A_ ** 2 / 2)
    U_ = HL * du_; V_ = HWv * dv_ * (1 - .20 * du_ ** 2)
    MID = leaf_mid(U_, V_)
    NA = unit(np.cross(np.gradient(MID, axis=1), np.gradient(MID, axis=0)))
    wax = CAP_R @ np.array([0, 0, 1.]); NA = np.where((NA @ wax)[..., None] < 0, -NA, NA)
    rr = np.clip(du_ ** 2 + dv_ ** 2, 0, 1)
    thick_panel('leaf_cap', MID, NA, .016, 'x1', 'cap', (ga + 1) / 2, (ga + 1) / 2, rim_n=4, front_extra=.012 * (1 - rr))
    ut = np.linspace(-.80, .82, 20) * HL
    rib = [leaf_mid(u, 0.) + wax * (.008 + .012 * (1 - (u / HL) ** 2) + .002) for u in ut]
    sweep('leaf_rib', rib, lambda s_, L: .0085 * (1 - .45 * abs(2 * s_ / L - 1) ** 2), 'x2', 'cap', rings=16, sides=10, caps=(True, True),
          ovals=lambda s_, L: (1., .6), ref0=wax)
    top_ = leaf_mid(.80 * HL, 0.) + wax * .012
    lx = CAP_R @ np.array([1., 0, 0]); ly = CAP_R @ np.array([0, 1., 0])
    stem_ctrl = [top_ - ly * .010, top_ + ly * .012 + wax * .016, top_ + ly * .022 + wax * .040 + lx * .004, top_ + ly * .012 + wax * .060 + lx * .008,
                 top_ - ly * .004 + wax * .064 + lx * .008]
    spath = [catmull(stem_ctrl, t) for t in np.linspace(0, 1, 24)]
    sweep('leaf_stem', spath, lambda s_, L: .0135 * (1 - .30 * s_ / L), 'band', 'cap', rings=12, sides=10, caps=(True, True))
    EXTRA['cap'] = {'centre': [float(v) for v in CAP_C]}
    BODY_SURF = pants
elif DESIGN == 'b':
    YB = .004
    # --- the plump butter top: a rolled hem at z .176, flaring to half-width .287 at z .21, the shoulders tucking into the head
    TOP = [(.196, .256, .200), (.181, .268, .210), (.176, .279, .219), (.180, .286, .225), (.200, .289, .228), (.240, .287, .226),
           (.290, .280, .221), (.340, .270, .213), (.390, .257, .203), (.440, .240, .190), (.490, .216, .171), (.530, .192, .153),
           (.570, .166, .134), (.610, .141, .116), (.650, .120, .102)]
    lathe('butter_top', [(z, ax, ay, YB) for (z, ax, ay) in TOP], 'torso', 'body', 48, 2.3, cap=(False, True))
    top = Surf(TOP[4:], 2.3, YB)
    # --- the apron: a waistband ring (z .368-.428) round the whole body, a thick front panel hanging straight down to
    # z .165 (rounded lower corners), two broad shoulder bands up under the neckerchief, a flat clasp at the back
    WB = []
    for k, z in enumerate(np.linspace(.364, .432, 9)):
        t = (z - .364) / (.432 - .364); off = .006 + .010 * math.sin(PI * t) ** .6
        WB.append((z, float(top.ax(z)) + off, float(top.ay(z)) + off, YB))
    lathe('apron_waistband', WB, 'pants', 'body', 48, 2.3)
    AP_T = .020
    AP = panel_grid(top, lambda z: .246, np.linspace(.165, .392, 14), 15, .055, .004, AP_T, -1, hang=True)
    thick_panel('apron_front', AP[0], AP[1], AP_T, 'x1', 'body', AP[2], AP[3])
    for s, tg in ((-1, 'R'), (1, 'L')):
        x = s * .150; z = np.linspace(.415, .600, 16)
        C = np.stack([np.full_like(z, x), top.front(x, z), z], -1); Nn = top.normal(C)
        C = C + Nn * .003
        strip('apron_band.' + tg, C, Nn + 0 * C, .031, .011, 'bib', 'body', nsec=9, embed=.001)
    Pc = np.array([0., float(top.back(0, .398)), .398]); nb = top.normal(Pc)[0]
    blob('apron_clasp', tuple(Pc + nb * .022), (.074, .016, .032), 'x2', 'body', 20, 8, p=(.55, .7, .55))
    # --- the neckerchief: a thick soft coral roll round the neck under the chin, a rounded knot at the front, two short
    # thick teardrop ends (their own object, bend rings)
    SC = dict(zf=CHIN - .016, zb=CHIN + .004, rx=.198, ryf=.180, ryb=.172, yc=YB - .004, hh=.036, ht=.042)
    def scarf_c(t):
        ry = SC['ryf'] if math.cos(t) > 0 else SC['ryb']
        return np.array([SC['rx'] * math.sin(t), SC['yc'] - ry * math.cos(t), SC['zf'] + (SC['zb'] - SC['zf']) * (1 - math.cos(t)) / 2])
    NT, NS = 52, 14
    th_ = np.linspace(0, 2 * PI, NT, endpoint=False); G = np.zeros((NT, NS, 3))
    for i, t in enumerate(th_):
        ry = SC['ryf'] if math.cos(t) > 0 else SC['ryb']; c = scarf_c(t)
        out_ = unit(np.array([math.sin(t) / SC['rx'], -math.cos(t) / ry, 0.]))
        hh = SC['hh'] * (1 + .06 * math.sin(3 * t + .4))
        for k in range(NS):
            a = 2 * PI * k / NS; ca, sa = math.cos(a), math.sin(a)
            G[i, k] = c + out_ * (SC['ht'] * float(spow(np.array(ca), .62))) + np.array([0, 0, hh * float(spow(np.array(sa), .72))])
    du = np.roll(G, -1, 0) - np.roll(G, 1, 0); dv = np.roll(G, -1, 1) - np.roll(G, 1, 1)
    Nn = unit(np.cross(du, dv)); cen = np.array([0, SC['yc'], SC['zf']])
    if ((Nn * (G - cen)).sum(-1) < 0).mean() > .5: Nn = -Nn
    V = G.reshape(-1, 3); NV = Nn.reshape(-1, 3); Fq = []
    for i in range(NT):
        for k in range(NS):
            Fq.append((i * NS + k, ((i + 1) % NT) * NS + k, ((i + 1) % NT) * NS + (k + 1) % NS, i * NS + (k + 1) % NS))
    make_obj('neckerchief_roll', V, Fq, ramp_uv('scarf', sval(NV, hi=.20, lo=.26)), 'scarf', NV)
    KNOT_C = scarf_c(0) + np.array([0, -.030, -.020])
    knot_R = rot_x(math.radians(-18))
    def knot_sdf(p):
        q = (p - KNOT_C) @ knot_R; return sell(q, [0, 0, 0], [.050, .034, .042], (2.2, 2.2, 2.2))
    sdf_ball('neckerchief_knot', knot_sdf, KNOT_C, 9, 'scarf', 'scarf', shade=lambda P, N: sval(N, hi=.22, lo=.24), t1=.12)
    TAB_INFO = {}
    for s, tg in ((-1, 'R'), (1, 'L')):
        ctrl = [KNOT_C + np.array([s * .020, -.006, -.016]), KNOT_C + np.array([s * .046, -.018, -.040]), KNOT_C + np.array([s * .070, -.026, -.066]),
                KNOT_C + np.array([s * .086, -.030, -.086])]
        path = [np.array(catmull(ctrl, t)) for t in np.linspace(0, 1, 30)]
        def tab_r(s_, L):
            t = s_ / L; r = .018 + .026 * smooth(0, .80, t)
            e = L - .036
            if s_ > e: r = min(r, .044 * math.sqrt(max(0., 1 - ((s_ - e) / .037) ** 2)))
            return max(r, .002)
        def tab_rings(L): return L * np.concatenate([np.linspace(0, .70, 9), .70 + .30 * np.sin(np.linspace(0, 1, 8)[1:] * PI / 2)])
        sweep('neckerchief_end.' + tg, path, tab_r, 'cuff', 'scarf_ends', rings=tab_rings, sides=14, caps=(True, True),
              ovals=lambda s_, L: (1.0, .42), ref0=np.array([0, -1., 0]))
        TAB_INFO[tg] = {'root': [float(v) for v in path[0]], 'tip': [float(v) for v in path[-1]]}
    EXTRA['neckerchief'] = {'knot': [float(v) for v in KNOT_C], 'ends': TAB_INFO, 'front_z': SC['zf'], 'back_z': SC['zb']}
    # --- arms: short butter sleeves, teal capsule arms, mitten hands (38 deg out, a little forward: the plump top)
    for s, tg in ((-1, 'R'), (1, 'L')):
        PAW_R = (.058, .050, .072)
        pc, Dv, Pv = build_arm(s, tg, np.array([s * .196, YB, .525]), math.radians(38), .14, -.060, .098, .070, .080, .046, .218, PAW_R)
        LOG['hand_clear_body_' + tg] = hand_clear(pc, Pv, PAW_R, top)
    legs(.132, .088, (.150, -.022, .050), (.118, .155, .050), .215)
    HIPS = [0, 0., .235]
    BODY_SURF = top
else:
    YB = -.012
    # --- the A-line smock: a rolled hem at z .160 (half-width .214), narrowing to the neck under the collar
    SMOCK = [(.180, .199, .163), (.165, .208, .171), (.160, .215, .177), (.164, .220, .181), (.180, .219, .181), (.220, .212, .175),
             (.270, .203, .167), (.320, .192, .158), (.370, .179, .147), (.420, .163, .135), (.460, .147, .123), (.490, .131, .111),
             (.515, .114, .099), (.540, .100, .089), (.570, .088, .080)]
    lathe('sky_smock', [(z, ax, ay, YB) for (z, ax, ay) in SMOCK], 'torso', 'body', 44, 2.3, cap=(False, True))
    smock = Surf(SMOCK[4:], 2.3, YB)
    # --- the rounded collar: one thick flat band lying on the shoulders round the neck, parting at the front into two
    # rounded lobes (sheet: z .50-.545 under the chin, +-.15 wide)
    ZCOL = CHIN - .030
    NCOL = 60; ua = np.linspace(0, 1, NCOL)
    gap = .10
    aa = PI + gap / 2 + (2 * PI - gap) * ua                          # from just right of the front centre, round the back, to just left
    zc_ = ZCOL - .008 * np.cos(aa - PI) - .004
    C = smock.pt(aa, zc_); Nn = smock.normal(C)
    Nn = unit(Nn + np.array([0, 0, .55]))                              # lie flat-ish on the shoulders
    end = np.minimum(ua, 1 - ua)
    hwc = (.030 + .022 * smooth(.22, .0, end)) * np.sqrt(np.clip(end / .045, 0, 1))
    hwc = np.maximum(hwc, .004)
    C = C + Nn * .004 + unit(C - np.array([0, YB, 0]) * np.array([1, 1, 0])) * np.array([1, 1, 0]) * .018
    strip('round_collar', C, Nn, hwc, .013, 'bib', 'body', nsec=9, embed=.002)
    # --- one big cream button on the chest
    Pb = np.array([0., float(smock.front(0, .425)), .425]); nb = smock.normal(Pb)[0]
    txv = unit(np.cross(np.array([0, 0, 1.]), nb)); tyv = np.cross(nb, txv)
    blob('smock_button', tuple(Pb + nb * .009), (.026, .026, .011), 'knot', 'body', 16, 8, p=(.85, .85, .55),
         orient=Matrix([list(txv), list(tyv), list(nb)]).transposed())
    # --- the satchel: a bevelled box with a rounded flap and a small button at her RIGHT hip (-X), turned to the front-side
    a_bag = PI + math.radians(30); zbag = .262
    Pbag = smock.pt(np.array([a_bag]), np.array([zbag]))[0]; nbag = smock.normal(Pbag)[0]; nbag = unit(nbag * np.array([1, 1, 0]))
    bx = unit(np.cross(np.array([0, 0, 1.]), nbag)); bz = np.array([0, 0, 1.]); by = -nbag   # box frame: x along, y into the body
    BAG_R = (.094, .030, .078)
    BAG_C = Pbag + nbag * (BAG_R[1] + .010)
    Mb = Matrix([list(bx), list(by), list(bz)]).transposed()
    blob('satchel_body', tuple(BAG_C), BAG_R, 'x1', 'bag', 24, 14, p=(.42, .55, .42), orient=Mb)
    FLAP_C = BAG_C + nbag * (BAG_R[1] + .002) + bz * .030
    blob('satchel_flap', tuple(FLAP_C), (.097, .010, .050), 'x2', 'bag', 24, 10, p=(.42, .6, .50), orient=Mb)
    blob('satchel_button', tuple(FLAP_C + nbag * .010 - bz * .030), (.012, .006, .012), 'knot', 'bag', 12, 6, p=(.9, .7, .9), orient=Mb)
    EXTRA['satchel'] = {'centre': [float(v) for v in BAG_C], 'side': 'her RIGHT hip (-X)'}
    # --- the band: from the bag's inner top corner up across the chest to her LEFT shoulder, over it, down the back to
    # her right side and round the right hip to the bag's outer end (sheet front: x .018 at z .337 -> .14 at z .50)
    ZS = CHIN - .010
    ctrl = [(PI + .34, .318), (PI + .16, .338), (PI + .02, .356), (PI - .05, .372), (PI - .42, .440), (PI - .72, .492), (PI / 2 + .25, ZS + .002), (PI / 2 - .30, ZS - .004),
            (.62, .470), (.26, .420), (-.08, .372), (-.42, .336), (-.80, .318), (-1.16, .312), (-1.40, .318)]
    Cp = np.array([list(catmull([(a, z, 0) for a, z in ctrl], t))[:2] for t in np.linspace(0, 1, 70)])
    C = smock.pt(Cp[:, 0], Cp[:, 1]); Nn = smock.normal(C)
    # lift: over the collar at the shoulder; clear the smock
    near_sh = np.exp(-((Cp[:, 1] - ZS) / .03) ** 2)
    C = C + Nn * (.008 + .012 * near_sh)[:, None]
    strip('satchel_band', C, Nn, .026, .009, 'band', 'bag', nsec=9, embed=.002)
    # --- arms: short sky sleeves, lime capsule arms, mitten hands
    for s, tg in ((-1, 'R'), (1, 'L')):
        PAW_R = (.047, .040, .058)
        pc, Dv, Pv = build_arm(s, tg, np.array([s * .134, YB, .452]), math.radians(35), .13, -.045, .074, .052, .060, .035, .168, PAW_R)
        LOG['hand_clear_body_' + tg] = hand_clear(pc, Pv, PAW_R, smock)
    legs(.096, .068, (.112, -.026, .041), (.093, .127, .041), .190)
    HIPS = [0, 0., .205]
    BODY_SURF = smock

# hidden surface: the parts buried in the head
LOG['culled_faces'] = {}
for g, m_ in (('body', .008), ('scarf', .004), ('cap', .002), ('bag', .004)):
    for ob in parts[g]: LOG['culled_faces'][ob.name] = cull_buried(ob, head_sdf, m_)

# ============================================================== PAINTED ATLAS (2048, deterministic PNG)
def stroke(x, z, P, half, aa):
    best = np.full(len(x), 9.)
    for i in range(len(P) - 1):
        a = P[i]; b = P[i + 1]; ab = b - a; L2 = ab @ ab
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dx = x - (a[0] + t * ab[0]); dz = z - (a[1] + t * ab[1])
        best = np.minimum(best, np.sqrt(dx * dx + dz * dz) - (half[i] * (1 - t) + half[i + 1] * t))
    return 1 - smooth(-aa, aa, best)
_CR = np.array(CFG['CREAM'], float)
def cream_alpha(q, aa=.0045):
    """the crisp cream lower face: below a boundary height that falls from the front centre round the jowls"""
    ph = np.degrees(np.arctan2(np.abs(q[:, 0]), -q[:, 1]))
    zb = np.interp(ph, _CR[:, 0], _CR[:, 1])
    return 1 - smooth(-aa, aa, q[:, 2] - zb)
def paint_head(d): return paint_head_P(radial_hit(d))
def paint_head_P(P):
    n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .03, HY - .07, y)
    # the sheet's skin as the mid tone, its cool shade in the turned-away areas and under the jowls, a gentle light only on
    # the domes' tops and the brow (the Kero round-2 lesson)
    up = smooth(.45, .90, n[:, 2]) * smooth(.45, .62, zr)
    C = ramp_colour('skinr', clamp(sval(n, 0., hi=0., lo=.26) + .07 * up))
    ca = cream_alpha(q)
    Cc = mix(rgb('cream'), rgb('creamshade'), clamp(.35 * smooth(.15, .95, -(n @ LIGHT))))
    C = mix(C, Cc, ca)
    under = smooth(-.25, -.85, n[:, 2]) * (1 - smooth(.06, .22, zr))
    C = mix(C, mix(rgb('skinshade'), rgb('creamshade'), ca), .55 * under * (1 - .60 * ca))
    valley = np.exp(-(q[:, 0] / .08) ** 2) * smooth(.52, .60, zr)
    C = mix(C, rgb('skinshade'), .30 * valley * (1 - ca))      # round 2: the groove between the domes reads from above
    # blush ovals (soft) on the cream border
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .95 * (1 - smooth(.62, 1.10, r)) * fr)
    # nostrils: two small dark dots
    nxW, nzW, nrW = CFG['NOSTRIL']
    for s in (-1, 1):
        r = np.sqrt(((x - s * nxW * W) / (nrW * W * 1.05)) ** 2 + ((z - (CHIN + nzW * W)) / (nrW * W * .92)) ** 2)
        C = mix(C, rgb('nostril'), (1 - smooth(.78, 1.12, r)) * fr)
    # brows: thin soft arcs on the domes, the outer end drooping a little
    bxW, bzW, bl, brise, bth, droop = CFG['BROW']
    t = np.linspace(-1, 1, 17)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * bl * W * t, BROW_Z + brise * W * (1 - t * t) - brise * .5 * W - droop * brise * W * np.maximum(t, 0) ** 2], -1)
        half = bth * W * np.maximum(0, 1 - t * t) ** .45 + .0022 * W
        box = fr * ((np.abs(x - s * BROW_X) < .10 * W) & (np.abs(z - BROW_Z) < .06 * W))
        a = np.zeros(len(x)); ib = box > 0
        if ib.any(): a[ib] = stroke(x[ib], z[ib], Pb, half, .0028 * W)
        C = mix(C, rgb('brow'), .95 * a * fr)
    # the smile: one clean line, a touch thicker at the middle, the corners rounded
    t_ = np.linspace(-1, 1, 81); Pm = mouth_curve(t_) * W; Pm[:, 1] += CHIN
    half = .0085 * W - .0020 * W * smooth(.6, 1., np.abs(t_))
    ib = (fr > 0) & (np.abs(x) < .17 * W) & (np.abs(z - MC - .02 * W) < .07 * W)
    a = np.zeros(len(x))
    if ib.any(): a[ib] = stroke(x[ib], z[ib], Pm, half, .0024 * W)
    C = mix(C, rgb('mouth'), .96 * a)
    return C

IRIS = CFG['IRIS']
def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * IRIS['ix']; iz = IRIS['iz']; irx = IRIS['irx']; irz = IRIS['irz']
    C = mix(rgb('sclera'), rgb('#ece0cc'), .45 * smooth(.35, .98, Z))
    C = mix(C, rgb('#f2e6d2'), .30 * smooth(.3, 1., s * X))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('iris0'), rgb('iris1'), smooth(-.85, -.25, ez))         # warm light at the bottom, deep at the top
    I = mix(I, rgb('iris2'), smooth(-.15, .40, ez))
    I = mix(I, rgb('iris3'), smooth(.40, .95, ez) * .85)
    I = mix(I, rgb('iris3'), smooth(.84, 1.0, r) * .70)
    I = I * (1 - .022 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix; pz = iz + .02; R = np.sqrt(((X - px_) / (IRIS['pw'] * irx)) ** 2 + ((Z - pz) / (IRIS['ph'] * irz)) ** 2)
    C = mix(C, rgb('pupil'), .85 * (1 - smooth(.96, 1.04, R)))
    clx, clz, clw, clh = IRIS['cl']
    big = np.sqrt(((X - (-s * clx)) / clw) ** 2 + ((Z - clz) / clh) ** 2)
    small = np.sqrt(((X - (s * .02)) / .070) ** 2 + ((Z + .44) / .070) ** 2)
    C = mix(C, rgb('#fffbf4'), np.maximum(1 - smooth(.90, 1.06, big), .70 * (1 - smooth(.80, 1.10, small))))
    C = mix(C, rgb('lash'), .85 * smooth(.92, 1.0, sr) * smooth(-.30, .30, Z))      # lid contact under the lash ribbon
    return C

def skin_chart(chart, U, V):
    """arms, legs, hands, feet: the skin with soft cool shading"""
    C = np.broadcast_to(rgb('skin'), U.shape + (3,)).copy()
    if chart == 'skin':     # shade on the backs (+Y is u = .75 on these tubes) and at the roots
        back = np.exp(-((U - .75) / .17) ** 2)
        C = mix(C, rgb('skinshade'), np.clip(.50 + 0 * U, 0, 1) * back + .30 * (1 - smooth(.0, .35, V)))
        C = mix(C, rgb('skinlight'), .30 * np.exp(-((U - .25) / .15) ** 2) * smooth(.2, .6, V))
    if chart == 'paw':
        back = np.exp(-(np.minimum(U, 1 - U) / .16) ** 2)
        C = mix(C, rgb('skinshade'), .40 * back)
        for du in (-.05, .05):
            C = mix(C, rgb('line'), .80 * np.exp(-((U - (.5 + du)) / .011) ** 2) * smooth(.68, .78, V) * (1 - smooth(.93, .985, V)))
        C = mix(rgb('skinshade'), C, .55 + .45 * smooth(.0, .30, V))
    if chart == 'foot':     # two toe grooves over the front of the foot, a soft cool sole
        for du in (-.045, .045):
            C = mix(C, rgb('line'), .90 * np.exp(-((U - (.5 + du)) / .0085) ** 2) * smooth(.30, .40, V) * (1 - smooth(.66, .78, V)))
        C = mix(C, rgb('skinlight'), .25 * smooth(.6, .9, V))
        C = mix(C, rgb('skinshade'), .60 * (1 - smooth(.02, .12, V)))
    return C

def lathe_z(V, rows): return np.interp(V, np.linspace(0, 1, len(rows)), [r[0] for r in rows])
def cloth(base, light, shade, deep, U, V, z=None):
    a = U * 2 * PI
    C = mix(rgb(base), rgb(light), .38 * smooth(-.3, .9, -np.cos(a)) * smooth(-.4, .8, np.sin(a + .5)))
    return mix(C, rgb(shade), .30 * smooth(.2, .95, np.cos(a)))
def paint(chart, U, V):
    if chart == 'head': return paint_head(head_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'headback': return paint_head(headback_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart in ('skin', 'paw', 'foot'): return skin_chart(chart, U, V)
    if chart == 'lash': return mix(rgb('lash'), rgb('#4a4038'), .40 * smooth(.60, .95, V))
    if chart == 'cavity': return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue': return mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V))
    if chart.startswith('lid'): return np.broadcast_to(rgb('skin'), U.shape + (3,)).copy()      # painted by the rig
    if chart == 'ramp':
        C = np.broadcast_to(rgb('skin'), U.shape + (3,)).copy(); hpx = CHARTS['ramp'][3]
        for name, row in RAMP_ROWS.items():
            m = (V * hpx >= row * 32) & (V * hpx < row * 32 + 32)
            C = np.where(m[..., None], ramp_colour(name, U), C)
        return C
    a = U * 2 * PI
    if DESIGN == 'a':
        if chart == 'torso':
            z = lathe_z(V, SHIRT)
            C = mix(rgb('shirt'), rgb('shirtlight'), .40 * smooth(.48, .56, z) * smooth(-.3, .9, -np.cos(a)))
            return mix(C, rgb('shirtshade'), .25 * smooth(.2, .9, np.cos(a)) + .25 * smooth(.60, .66, z))
        if chart == 'sleeve':
            C = mix(rgb('shirt'), rgb('shirtlight'), .40 * smooth(.15, .60, V) * smooth(-.2, .8, np.sin(a)))
            C = mix(C, rgb('shirtshade'), .30 * smooth(.2, .9, -np.sin(a)))
            return mix(C, rgb('shirtdeep'), smooth(.74, .80, V))
        if chart == 'pants':
            z = lathe_z(V, PANTS)
            C = mix(rgb('over'), rgb('overlight'), .30 * smooth(.25, .36, z) * smooth(-.2, .9, -np.cos(a)))
            C = mix(C, rgb('overshade'), .25 * smooth(.3, .95, np.cos(a)) + .30 * (1 - smooth(.19, .23, z)))
            # the front pocket: a soft rounded-rectangle seam on the belly (sheet z .29-.43, +-.14)
            x = pants.ax(z) * spow(np.sin(a), 2 / 2.3); front = np.cos(a) < -.3
            pk = np.maximum(np.abs(x) / .135, np.abs(z - .345) / .062)
            C = mix(C, rgb('overshade'), .55 * np.exp(-((pk - 1) / .045) ** 2) * front * (z < .40))
            return C
        if chart == 'cuff':
            C = mix(rgb('over'), rgb('overshade'), .28 * smooth(.2, .9, np.cos(a)) + .20 * smooth(.40, .60, V))
            C = mix(C, rgb('overlight'), .25 * smooth(-.2, .9, -np.cos(a)) * (1 - smooth(.3, .6, V)))
            return mix(C, rgb('overdeep'), .60 * smooth(.66, .76, V))
        if chart == 'bib':
            fr_ = V >= .29; vv = (V - .30) / .70
            C = mix(rgb('over'), rgb('overlight'), .28 * smooth(.45, 1., vv) * fr_)
            return mix(C, rgb('overshade'), .18 * (1 - smooth(0, .3, vv)) * fr_ + .45 * (~fr_))
        if chart == 'band':     # the straps, tabs and the stem: soft across-shading
            return mix(rgb('overshade'), rgb('over'), smooth(.0, .6, np.sin(U * PI)) * .85 + .15)
        if chart == 'knot':     # the buttons: cream domes, a soft shade toward the rim
            return mix(rgb('buttonshade'), rgb('button'), smooth(.45, .80, V))
        if chart == 'x1':       # the leaf: lighter toward the middle, darker at the rim and underneath
            fr_ = V >= .29; uu = (U - .04) / .92 * 2 - 1; vv = (V - .30) / .70 * 2 - 1; r2 = uu * uu + vv * vv
            C = mix(rgb('leaf'), rgb('leaflight'), .45 * (1 - smooth(.0, .8, r2)) * fr_)
            C = mix(C, rgb('leafshade'), (.45 * smooth(.55, 1.0, r2) + .25 * smooth(.0, .9, uu)) * fr_ + .75 * (~fr_))
            return mix(C, rgb('leaflight'), .35 * np.exp(-(vv / .05) ** 2) * fr_ * (np.abs(uu) < .85))
        if chart == 'x2':       # the rib: a light raised line
            return mix(rgb('leaf'), rgb('leaflight'), .55 + .35 * smooth(.0, .8, np.sin(U * PI)))
    elif DESIGN == 'b':
        if chart == 'torso':
            z = lathe_z(V, TOP)
            C = mix(rgb('top'), rgb('toplight'), .40 * smooth(.42, .52, z) * smooth(-.3, .9, -np.cos(a)))
            C = mix(C, rgb('topshade'), .25 * smooth(.2, .9, np.cos(a)) + .30 * smooth(.58, .64, z))
            return mix(C, rgb('topdeep'), .55 * (V < .12) + .25 * np.exp(-((z - .184) / .010) ** 2))
        if chart == 'sleeve':
            C = mix(rgb('top'), rgb('toplight'), .40 * smooth(.15, .60, V) * smooth(-.2, .8, np.sin(a)))
            C = mix(C, rgb('topshade'), .30 * smooth(.2, .9, -np.sin(a)))
            return mix(C, rgb('topdeep'), smooth(.74, .80, V))
        if chart == 'pants':    # the apron waistband
            C = mix(rgb('apron'), rgb('apronlight'), .45 * smooth(-.3, .9, -np.cos(a)) * smooth(.2, .5, V) * (1 - smooth(.6, .9, V)))
            return mix(C, rgb('apronshade'), .40 * (1 - smooth(.05, .30, V)) + .30 * smooth(.80, 1., V) + .20 * smooth(.3, .95, np.cos(a)))
        if chart == 'x1':       # the apron panel: a soft fold shade toward the hem, a lighter middle
            fr_ = V >= .29; vv = (V - .30) / .70; uu = (U - .04) / .92
            C = mix(rgb('apron'), rgb('apronlight'), .35 * np.exp(-((uu - .45) / .25) ** 2) * fr_)
            C = mix(C, rgb('apronshade'), (.22 * (1 - smooth(.0, .25, vv)) + .30 * smooth(.85, 1.0, vv) + .20 * smooth(.75, 1., np.abs(uu - .5) * 2)) * fr_ + .50 * (~fr_))
            return C
        if chart == 'bib':      # the shoulder bands
            return mix(rgb('apronshade'), rgb('apronlight'), smooth(.0, .7, np.sin(U * PI)) * .9 + .1)
        if chart == 'x2':       # the back clasp
            return mix(rgb('apronshade'), rgb('apronlight'), smooth(.35, .75, V))
        if chart == 'cuff':     # the neckerchief ends
            C = mix(rgb('scarf'), rgb('scarflight'), .35 * smooth(.0, .8, -np.sin(a)))
            return mix(C, rgb('scarfshade'), .40 * smooth(.0, .9, np.sin(a)) + .25 * (1 - smooth(.0, .25, V)))
    else:
        if chart == 'torso':
            z = lathe_z(V, SMOCK)
            C = mix(rgb('smock'), rgb('smocklight'), .38 * smooth(.36, .46, z) * smooth(-.3, .9, -np.cos(a)))
            C = mix(C, rgb('smockshade'), .25 * smooth(.2, .9, np.cos(a)) + .25 * smooth(.50, .56, z))
            return mix(C, rgb('smockdeep'), .55 * (V < .12) + .25 * np.exp(-((z - .168) / .010) ** 2))
        if chart == 'sleeve':
            C = mix(rgb('smock'), rgb('smocklight'), .40 * smooth(.15, .60, V) * smooth(-.2, .8, np.sin(a)))
            C = mix(C, rgb('smockshade'), .30 * smooth(.2, .9, -np.sin(a)))
            return mix(C, rgb('smockdeep'), smooth(.74, .80, V))
        if chart == 'bib':      # the collar: cream, lighter on the crest
            return mix(rgb('collarshade'), rgb('collarlight'), smooth(.0, .7, np.sin(U * PI)) * .9 + .1)
        if chart == 'knot':     # the buttons
            return mix(rgb('collarshade'), rgb('collarlight'), smooth(.45, .80, V))
        if chart == 'x1':       # the satchel body
            C = mix(rgb('bag'), rgb('baglight'), .35 * smooth(-.2, .9, -np.cos(a)) * smooth(.3, .8, V))
            return mix(C, rgb('bagshade'), .35 * smooth(.2, .95, np.cos(a)) + .30 * (1 - smooth(.05, .35, V)))
        if chart == 'x2':       # the flap
            C = mix(rgb('bag'), rgb('baglight'), .40 * smooth(-.2, .9, -np.cos(a)) * smooth(.4, .9, V))
            return mix(C, rgb('bagdeep'), .45 * (1 - smooth(.05, .30, V)) + .25 * smooth(.2, .95, np.cos(a)))
        if chart == 'band':     # the band
            return mix(rgb('bagshade'), rgb('bag'), smooth(.0, .6, np.sin(U * PI)) * .85 + .15)
    return np.broadcast_to(rgb('skin'), U.shape + (3,)).copy()

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = list(np.round(rgb('skin') * 255).astype(int)) + [255]
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
atlas_path = os.path.join(ROOT, TAG + ('_rig_atlas.png' if RIG else '_atlas.png'))
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
del atlas, raw
img = bpy.data.images.load(atlas_path); img.name = NM + '_toy_painted_atlas_2048'; img.pack()
MAT = bpy.data.materials.new(NM + '_toy_atlas'); MAT.use_nodes = True
bs = next(n for n in MAT.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
sk = np.array([list(v.co) for v in skin.data.vertices])
allv = all_verts([o for g in GROUPS for o in parts[g]])
def width_at(zw):
    zz = CHIN + zw * W; band_ = sk[np.abs(sk[:, 2] - zz) < .0035]
    return round(float(np.ptp(band_[:, 0]) / W / 2), 3) if len(band_) else None
MEAS = {'W_m': W, 'chin_z_m': round(CHIN, 4), 'head_y_m': round(HY, 4), 'total_height_m': round(float(allv[:, 2].max()), 4),
        'min_z_m': round(float(allv[:, 2].min()), 4), 'width_m': round(float(np.ptp(allv[:, 0])), 4), 'depth_m': round(float(np.ptp(allv[:, 1])), 4),
        'head_width_W': round(float(np.ptp(sk[:, 0]) / W), 3), 'dome_top_above_chin_W': round(float((sk[:, 2].max() - CHIN) / W), 3),
        'head_height_m': round(float(sk[:, 2].max() - sk[:, 2].min()), 4), 'head_depth_W': round(float(np.ptp(sk[:, 1]) / W), 3),
        'front_half_widths_W': {str(z): width_at(z) for z in (.05, .10, .20, .29, .40, .50, .60, .70)},
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'eye_opening_W': [round(float(np.ptp(RIM_L[:, 0]) / W), 3), round(float(np.ptp(RIM_L[:, 2]) / W), 3)]}
MEAS.update(LOG)

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
NAMES = {'head': '_head', 'eye.L': '_eye_L', 'eye.R': '_eye_R', 'lash.L': '_lash_L', 'lash.R': '_lash_R', 'cap': '_leaf_cap',
         'scarf': '_neckerchief', 'scarf_ends': '_neckerchief_ends', 'body': '_body', 'bag': '_satchel',
         'arm.L': '_arm_L', 'arm.R': '_arm_R', 'leg.L': '_leg_L', 'leg.R': '_leg_R'}
for group, obs in parts.items():
    if not obs: continue
    for ob in obs:
        ob.data.materials.clear(); ob.data.materials.append(MAT)
        if RIG:
            vg = ob.vertex_groups.new(name='_part_' + ob.name); vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs: ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; ob.name = NM + NAMES[group]; ob.data.name = NM + NAMES[group]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-8)
    bad = [f for f in bm.faces if f.calc_area() < 1e-12]
    if bad: bmesh.ops.delete(bm, geom=bad, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(ob.data); bm.free()
    for p in ob.data.polygons: p.material_index = 0; p.use_smooth = True
    if ob.data.attributes.get('cust_n') is not None:
        me = ob.data; a = me.attributes.get('cust_n')
        sn = np.zeros(len(me.vertices) * 3, np.float32); a.data.foreach_get('vector', sn); sn = sn.reshape(-1, 3)
        cn = np.zeros(len(me.loops) * 3, np.float32); me.corner_normals.foreach_get('vector', cn); cn = cn.reshape(-1, 3)
        lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
        use = np.linalg.norm(sn[lv], axis=1) > .5
        cn[use] = sn[lv][use]
        me.normals_split_custom_set([tuple(v) for v in cn]); me.attributes.remove(me.attributes['cust_n'])
    piv = {'head': tuple(O), 'cap': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'], 'lash.L': eye_centers['L'], 'lash.R': eye_centers['R'],
           'scarf': (0, YB, CHIN - .01), 'scarf_ends': tuple(EXTRA['neckerchief']['knot']) if 'neckerchief' in EXTRA else (0, 0, 0),
           'bag': tuple(EXTRA['satchel']['centre']) if 'satchel' in EXTRA else (0, 0, 0),
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip']}.get(group, (0, 0, 0))
    bpy.context.scene.cursor.location = piv; bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for v in ob.data.vertices: assert all(math.isfinite(c) for c in v.co), 'Nonfinite position'
    for p in ob.data.polygons: assert all(math.isfinite(c) for c in p.normal) and p.normal.length > .5, ('Bad normal', ob.name, p.index)
    ob['phase'] = '1: neutral A-pose, no armature'; ob['front_axis'] = '-Y'; ob['units'] = 'metres'
    ob.data.calc_loop_triangles(); part_tri[group] = len(ob.data.loop_triangles); objects.append(ob)
tri_count = sum(part_tri.values()); print('PART_TRIANGLES', json.dumps(part_tri), flush=True)
MEAS['part_triangles'] = part_tri; MEAS['triangles'] = tri_count

dome_c = {tag: [float(v) for v in L2M(np.array([s * HP['dx'], HP['dy'], HP['dz']]))] for s, tag in ((-1, 'R'), (1, 'L'))}
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X', 'design': DESIGN,
          'root': [0, 0, 0], 'hips': HIPS, 'spine': [0, YB, HIPS[2] + .10], 'chest': [0, YB, HIPS[2] + .21], 'neck': [0, YB, CHIN - .02],
          'head_base': [0, float(HY * .5 + YB * .5), CHIN + .02], 'head': [float(v) for v in O],
          'jaw_pivot': [0, float(HY - .10 * W), float(CHIN + .12 * W)],
          'mouth_corners': {'L': [float(MHW + .006 * W), float(front_hit(MHW, CHIN + MZK * W)[0]), float(CHIN + MZK * W)],
                            'R': [float(-MHW - .006 * W), float(front_hit(-MHW, CHIN + MZK * W)[0]), float(CHIN + MZK * W)]},
          'eyes': eye_centers, 'eye_domes': dome_c,
          'brows': {'L': [BROW_X, float(front_hit(BROW_X, BROW_Z)[0]), BROW_Z], 'R': [-BROW_X, float(front_hit(-BROW_X, BROW_Z)[0]), BROW_Z]},
          'lashes': lash_info, 'arms': joint_arms, 'legs': joint_legs, 'extras': EXTRA,
          'notes': ['Phase 1: no rig, weights or animations. No ears or tail (a frog): their contract bones stay unweighted.',
                    'Head skin = zero surface of one smooth implicit (frog skull superquadric + snout swelling + two eye domes, smin), radially projected, analytic normals.',
                    'Eyelid holes ringed by %d concentric loops each, rim rolled in behind separate lens eyeballs; 3 loops follow the smile.' % len(EYE_SCALES),
                    'Separate pieces: eyes, lash ribbons (origin at the eye centre, for the upper lids)' +
                    {'a': ', the leaf cap (a rigid head follower); the overalls, straps and buttons are in the body (rigid on the spine / hips).',
                     'b': ', the neckerchief roll + knot (rigid on the neck / chest), its two ends (hanging cloth with bend rings, origin at the knot); the apron is in the body.',
                     'c': ', the satchel + band (rigid on the hips / spine); the collar and button are in the body.'}[DESIGN]]}
if not RIG:
    with open(os.path.join(ROOT, 'joints-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if not RIG:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, TAG + '.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
print('FOLKFROG_BUILD_DONE', json.dumps({'design': DESIGN, 'triangles': tri_count, 'model': MODEL}), flush=True)
