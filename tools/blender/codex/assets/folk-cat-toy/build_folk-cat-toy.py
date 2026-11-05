"""The Blender townsfolk cats (Z-D6, task folk-cat-toy), Opus build, phase 1 (the models). Blender 4.3, no addons.
Deterministic. One family script with a shared species base and per-design proportions, markings and outfits.

    blender --background --factory-startup --python build_folk-cat-toy.py -- --design a|b|all

  a: Momo, the patient gardener (cream, one peach eye patch, sage bib overalls)  -> public/models/folk-cat-a-toy.glb
  b: Kinako, the cheerful baker's helper (ginger, cream muzzle, wrap top, teal sash, blue bandana)
                                                                                 -> public/models/folk-cat-b-toy.glb
1 unit = 1 m, front = -Y, feet on z = 0, character left = +X. Writes only inside this folder plus the two GLBs.

Technique (the Mochi / Kome toy-line machinery, Kome's build as the base):
- The head is ONE smooth implicit ball: a superquadric fitted to the sheet's front outline and side profile
  (scratch/headfit.py), with a gentle lower-face fullness and a nose button smooth-unioned in. Its skin is the field's zero
  surface reached by radial projection (CDT in a stereographic domain with edge loops round both eyelid holes, the nose
  and the mouth), every vertex on the surface with the field's analytic normal: the face stays convex, no sockets. The
  markings (A's patch, B's muzzle), brows, nose, mouth and blush are painted on the ball from 3D positions into a 2048
  atlas.
- The eyes are separate flush lens globes in real lid holes; the upper lash line is its own object per eye (a thick
  tapered ribbon on the skin with one wing flick, as on the sheet).
- The ears are thick rounded-cone volumes (parametric, exact normals) with a shallow dish.
- A: a yellow shirt torso, sage overall pants with a rolled waistband and two short rolled cuffs, front and back bibs as
  thick panels, two broad straps over the shoulders, two big cream buttons; short sleeves, capsule arms, mitten paws,
  stubby legs, big oval feet, a thick hooked cream tail.
- B: a pear-shaped yellow wrap top with a rolled hem, crossed collar bands (her left over her right, the V of fur at the
  neck), a thick teal sash, short wide sleeves, a soft blue bandana ring tilted back under the ears with a rounded knot and
  two broad tabs (their own object, with bend rings), a thick hooked ginger tail with a cream tip.
"""
import bpy, bmesh, math, json, os, struct, zlib, sys
import numpy as np
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
DESIGN = ARGV[ARGV.index('--design') + 1] if '--design' in ARGV else 'a'
RIG = bool(globals().get('RIG_MODE'))      # reserved for the phase-2 rig script: no approved file is written in rig mode
if RIG: DESIGN = globals().get('RIG_DESIGN', DESIGN)
if DESIGN == 'all':
    import subprocess, time
    for d in ('a', 'b'):
        p = subprocess.Popen([bpy.app.binary_path, '--background', '--factory-startup', '--python', os.path.abspath(__file__), '--', '--design', d])
        with open(os.path.join(ROOT, 'pids.log'), 'a', encoding='utf-8') as pl:
            pl.write('%s started %d (child of the all-run): design %s\n' % (time.strftime('%H:%M:%S'), p.pid, d))
        try: p.wait(timeout=900)
        except subprocess.TimeoutExpired:
            p.kill(); p.wait(); print('DESIGN_TIMEOUT', d, p.pid, flush=True)
    raise SystemExit(0)
assert DESIGN in ('a', 'b'), DESIGN
TAG = 'folk-cat-%s-toy' % DESIGN
NM = {'a': 'FolkCatA', 'b': 'FolkCatB'}[DESIGN]
MODEL = 'D:/projects/chewy-life-3d/public/models/%s.glb' % TAG
os.makedirs(os.path.join(ROOT, 'preview', DESIGN), exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi
LOG = {'design': DESIGN}

# ============================================================== per-design configuration (measure-a.md / measure-b.md)
# head-local units: W = the head width at the cheeks; x lateral (+ = her left), y depth (+ = back) from the head centre,
# z above the chin
CFG = {
    'a': dict(W=.623, CHIN=.527, HY=.029,
              HEAD=dict(A=.500, BF=.430, BB=.420, ZC=.262, HT=.450, HB=.262, nA_t=2.15, nA_b=2.85, nB_t=2.7, nB_b=3.2, n=2.0, nBb_t=2.6, nBb_b=2.3, egg=.33),
              LOWFACE=dict(m=.03, z=.17, w=.11),
              EYE=(.203, .302, .1035, .0945),                 # centre x, z; opening half-width, half-height
              NOSE_Z=.232, NOSE_R=(.042, .022, .026), NOSE_TRI=(.0375, .252, .222),
              MOUTH=dict(zc=.168, zk=.189, hw=.0825, D=.034, phil=.215, mc=.1665),
              BROW=(.212, .512, .054, .020, .0075),           # centre x, z; half-length, arc rise, half-thickness
              BLUSH=(.320, .168, .062, .038),
              EARW=dict(out=[(.13, .54), (.42, .36), (.466, .46), (.468, .56), (.460, .64), (.446, .70), (.428, .748), (.406, .785),
                             (.380, .813), (.352, .834), (.326, .843), (.300, .836), (.262, .808), (.210, .770), (.155, .730), (.108, .697), (.086, .655)],
                        c2=(.30, .62), yc=.03, yaw=14., lean=16., T0=.115, T1=.042, zt=.60, rim=.034, dish=.016, zp=.60),
              IRIS=dict(ix=.275, irx=.70, irz=.98, pw=.43, ph=.70, cl=(.46, .55, .19, .235)),
              LASH=(.24, .085), WING=((26, .95), (1.37, .77))),
    'b': dict(W=.663, CHIN=.529, HY=.010,
              HEAD=dict(A=.500, BF=.410, BB=.400, ZC=.228, HT=.446, HB=.228, nA_t=2.3, nA_b=2.95, nB_t=2.3, nB_b=2.7, n=2.0, nBb_t=2.6, nBb_b=2.3, egg=.33),
              LOWFACE=dict(m=.06, z=.15, w=.11),
              EYE=(.197, .282, .1025, .083),
              NOSE_Z=.225, NOSE_R=(.035, .017, .023), NOSE_TRI=(.028, .240, .217),
              MOUTH=dict(zc=.160, zk=.175, hw=.079, D=.028, phil=.209, mc=.1585),
              BROW=(.199, .455, .045, .022, .0090),
              BLUSH=(.304, .172, .058, .036),
              EARW=dict(out=[(.13, .50), (.42, .32), (.470, .42), (.462, .52), (.440, .59), (.417, .65), (.394, .70), (.370, .735),
                             (.342, .762), (.314, .780), (.292, .786), (.266, .777), (.225, .746), (.175, .711), (.125, .676), (.095, .645), (.085, .600)],
                        c2=(.29, .58), yc=.03, yaw=14., lean=16., T0=.115, T1=.042, zt=.56, rim=.034, dish=.016, zp=.58),
              IRIS=dict(ix=.30, irx=.62, irz=.98, pw=.47, ph=.72, cl=(.53, .52, .17, .25)),
              LASH=(.26, .10), WING=((26, .95), (1.27, .78))),
}[DESIGN]
W = CFG['W']; CHIN = CFG['CHIN']; HY = CFG['HY']
SW = W / .44                           # Rosie's metric detail sizes (0.44 m head) scaled to this head

if DESIGN == 'a':
    PAL = {'fur': '#fff4ea', 'furshade': '#efd3be', 'patch': '#ffca94', 'patchshade': '#f0ad78', 'patchlight': '#ffd8aa',
           'inner': '#ffd3aa', 'innerdeep': '#f8bd8e', 'innerP': '#ffb87e', 'innerPdeep': '#f2a06a',
           'nose': '#c4807a', 'noseh': '#dca39c', 'blush': '#efa7a0',
           'shirt': '#f6d98b', 'shirtlight': '#fbe4a4', 'shirtshade': '#e3c172', 'shirtdeep': '#cfac5e',
           'over': '#9dba8c', 'overlight': '#afc99e', 'overshade': '#87a478', 'overdeep': '#6f8c62',
           'button': '#fff4ea', 'buttonshade': '#ecd9c6',
           'lash': '#2d1b16', 'brow': '#5c3628', 'mouth': '#8a3d2e', 'line': '#e9cfba',
           'iris0': '#c08a48', 'iris1': '#8a5a2c', 'iris2': '#5a3418', 'iris3': '#3a2012', 'pupil': '#22140f'}
else:
    PAL = {'fur': '#f4a860', 'furshade': '#df8e4c', 'furlight': '#f8b878', 'cream': '#fff4ea', 'creamshade': '#f1d8c4',
           'inner': '#ffd8a8', 'innerdeep': '#f6bf8e',
           'nose': '#c47c72', 'noseh': '#dca096', 'blush': '#efa7a0',
           'top': '#f6d98b', 'toplight': '#fbe4a4', 'topshade': '#e3c172', 'topdeep': '#cfac5e',
           'sash': '#78aaa3', 'sashlight': '#8cbab3', 'sashshade': '#62948d', 'sashdeep': '#507e78',
           'band': '#b0ccd5', 'bandlight': '#c4dbe2', 'bandshade': '#96b2bc', 'banddeep': '#809ea8',
           'lash': '#2d1b16', 'brow': '#6a3a22', 'mouth': '#8a3d2e', 'line': '#d4874a',
           'iris0': '#dca050', 'iris1': '#b97530', 'iris2': '#7a4418', 'iris3': '#4e2a10', 'pupil': '#22140f'}

# 2048 atlas charts (x, y, w, h) in pixels, y up (Blender UV convention). The lid / cavity / tongue charts are reserved
# for the phase-2 rig (painted plain fur now).
CHARTS = {'head': (0, 768, 1280, 1280), 'headback': (1280, 1280, 768, 768),
          'eye.L': (1280, 896, 384, 384), 'eye.R': (1664, 896, 384, 384),
          'ear.L': (1280, 640, 384, 256), 'ear.R': (1664, 640, 384, 256),
          'torso': (0, 384, 512, 384), 'sleeve': (512, 384, 512, 384), 'pants': (1024, 512, 256, 256), 'bib': (1024, 256, 256, 256),
          'skin': (512, 128, 512, 256), 'paw': (1024, 0, 256, 256), 'foot': (1280, 384, 384, 256), 'tail': (1664, 384, 384, 256),
          'band': (1280, 192, 256, 192), 'knot': (1280, 0, 256, 192), 'cuff': (1536, 0, 256, 384),
          'nose': (1792, 0, 256, 256), 'lash': (1792, 256, 256, 128),
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
def unit(v): return v / np.linalg.norm(v, axis=-1, keepdims=True)

# ============================================================== the head ball (implicit, W units, z above the chin)
LOWFACE = CFG['LOWFACE']; HEAD = CFG['HEAD']
def prof(z, m_t, m_b):
    zc = HEAD['ZC']; v = np.where(z >= zc, (z - zc) / HEAD['HT'], (zc - z) / HEAD['HB'])
    m = np.where(z >= zc, m_t, m_b); vv = np.clip(v, 0, 1)
    return np.maximum(np.clip(1 - vv ** m, 0, 1) ** (1 / m), 1e-4), v
def skull_local(q):
    x, y, z = q[..., 0], q[..., 1], q[..., 2]
    gA, v = prof(z, HEAD['nA_t'], HEAD['nA_b']); gB, _ = prof(z, HEAD['nB_t'], HEAD['nB_b']); gBb, _ = prof(z, HEAD['nBb_t'], HEAD['nBb_b'])
    a = HEAD['A'] * gA; b = np.where(y < 0, HEAD['BF'] * gB * (1 + LOWFACE['m'] * np.exp(-((z - LOWFACE['z']) / LOWFACE['w']) ** 2)), HEAD['BB'] * gBb); n = HEAD['n']
    vv = np.clip(y / b, -1, 0); a = a * (1 - HEAD['egg'] * vv * vv)     # egg-shaped front: the face wraps round, eyes face ~30 deg out
    s = (np.abs(x / a) ** n + np.abs(y / b) ** n) ** (1 / n)
    d = (s - 1) * np.minimum(a, b)
    return np.where(v > 1, np.maximum(d, (v - 1) * np.where(z >= HEAD['ZC'], HEAD['HT'], HEAD['HB'])), d)
def ell(q, c, r):
    q = (q - np.asarray(c)) / np.asarray(r)
    k0 = np.sqrt((q * q).sum(-1)); k1 = np.sqrt(((q / np.asarray(r)) ** 2).sum(-1))
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def smin(a, b, k):
    h = np.clip(.5 + .5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)
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
NZ_L = CFG['NOSE_Z']
_yn = float(front_local(0, NZ_L, skull_local)[0])
K_N = .014
# the nose button has the painted nose's own outline: a rounded inverted triangle (x, z) extruded forward, soft edges,
# ~0.04 W proud, so the pink covers the whole button (no pale underside streak)
_hwN, _ztN, _zbN = CFG['NOSE_TRI']
NOSE_YC = _yn - .012; NOSE_RY = .024 * CFG['NOSE_R'][1] / .022; NOSE_RR = .006
def tri_sd(x, z):
    sh = x.shape; d = poly_sd(x.ravel(), z.ravel(), [(-_hwN, _ztN), (_hwN, _ztN), (0, _zbN)]); return d.reshape(sh)
def nose_sdf(q):
    d2 = tri_sd(q[..., 0], q[..., 2]) - (.009 - NOSE_RR); dy = np.abs(q[..., 1] - NOSE_YC) - NOSE_RY
    return np.hypot(np.maximum(d2, 0), np.maximum(dy, 0)) + np.minimum(np.maximum(d2, dy), 0) - NOSE_RR
def head_local(q):
    out = skull_local(q)
    near = (np.abs(q[..., 0]) < .09) & (np.abs(q[..., 2] - NZ_L) < .08) & (q[..., 1] < NOSE_YC + .08)
    if np.any(near): out = np.where(near, smin(out, nose_sdf(q), K_N), out)
    return out
_zt = np.linspace(NZ_L - .05, NZ_L + .06, 111); _ft = front_local(np.zeros_like(_zt), _zt, head_local)
NOSE_TIP_L = float(np.nanmin(_ft)); NOSE_TIP_Z = float(_zt[np.nanargmin(_ft)])
def L2M(q): return np.stack([q[..., 0] * W, HY + q[..., 1] * W, CHIN + q[..., 2] * W], -1)
def M2L(p): return np.stack([p[..., 0] / W, (p[..., 1] - HY) / W, (p[..., 2] - CHIN) / W], -1)
def head_sdf(p): return head_local(M2L(p)) * W
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
def ray_hit(o, d, f=head_sdf, t0=0., t1=.6, it=34):
    """per-ray origins (inside) and directions -> the first exit point"""
    lo = np.full(len(d), t0); hi = np.full(len(d), t1)
    for _ in range(it):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return o + d * ((lo + hi) / 2)[:, None]
def grad_n(p, f=head_sdf, e=1.5e-4):
    g = np.zeros_like(p)
    for k in range(3):
        dp = np.zeros(3); dp[k] = e; g[:, k] = f(p + dp) - f(p - dp)
    return unit(g)
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
NZ = CHIN + NZ_L * W; MOUTH = CFG['MOUTH']; MC = CHIN + MOUTH['mc'] * W; MHW = MOUTH['hw'] * W
BROW_X = CFG['BROW'][0] * W; BROW_Z = CHIN + CFG['BROW'][1] * W
BLUSH = (CFG['BLUSH'][0] * W, CHIN + CFG['BLUSH'][1] * W, CFG['BLUSH'][2] * W, CFG['BLUSH'][3] * W)

# ============================================================== geometry helpers
GROUPS = ['head', 'eye.L', 'eye.R', 'lash.L', 'lash.R', 'ear.L', 'ear.R', 'band', 'tabs', 'body', 'arm.L', 'arm.R', 'leg.L', 'leg.R', 'tail']
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

def lathe(name, rows, chart, group, N=64, n=2.0, fold=None, cap=(False, False), vrange=(0., 1.)):
    """ring surface: rows of (z, ax, ay[, yc[, xc]]); superellipse sections (exponent n); front (-Y) at u = .5"""
    verts = []; faces = []; uvs = []; M = len(rows)
    for j, row in enumerate(rows):
        z, ax, ay = row[:3]; yc = row[3] if len(row) > 3 else 0.; xc = row[4] if len(row) > 4 else 0.; t = j / (M - 1)
        for i in range(N):
            a = 2 * PI * i / N; f = fold(a, t) if fold else 1.
            verts.append((xc + ax * spow(math.sin(a), 2 / n) * f, yc + ay * spow(math.cos(a), 2 / n) * f, z))
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

def lathe_fns(rows, n):
    """front-surface y and outward normal of a monotonic lathe (rows sorted by z)"""
    Z = np.array([r[0] for r in rows]); AX = np.array([r[1] for r in rows]); AY = np.array([r[2] for r in rows])
    def front(x, z):
        ax = np.interp(z, Z, AX); ay = np.interp(z, Z, AY)
        return -ay * np.clip(1 - np.abs(np.asarray(x) / ax) ** n, 0, 1) ** (1 / n)
    def field(P):
        ax = np.interp(P[:, 2], Z, AX); ay = np.interp(P[:, 2], Z, AY)
        return (np.abs(P[:, 0] / ax) ** n + np.abs(P[:, 1] / ay) ** n) ** (1 / n) - 1
    def normal(P):
        P = np.atleast_2d(np.asarray(P, float)); g = np.zeros_like(P)
        for k in range(3):
            dp = np.zeros(3); dp[k] = 1e-4; g[:, k] = field(P + dp) - field(P - dp)
        return unit(g)
    return front, normal, (Z, AX, AY)

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
                uu = lambda jj: uarr[jj]; vv = lambda ii: varr[ii]
                q = ((uu(j), vv(i)), (uu(j + 1), vv(i)), (uu(j + 1), vv(i + 1)), (uu(j), vv(i + 1)))
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

# ============================================================== HEAD SKIN: CDT on the ball, eyelid / nose / mouth loops
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
    wn = (1 - .45 * smooth(-.10, -.80, np.cos(psi))) * (1 - .30 * smooth(-.2, -.9, np.sin(psi)))   # tighter toward the nose / mouth
    for k, kk in enumerate(EYE_SCALES): add_loop(c + (base - c) * (1 + (kk - 1) * wn[:, None]), 'eye%d_%d' % (s, k))
pts.append(tuple(to_dom(surf_dir(np.array([0.]), np.array([NZ])))[0])); tags['nose_c'] = [len(pts) - 1]
NOSE_LOOPS = [(.006, 12), (.012, 18), (.019, 24), (.027, 30)]
_nc = np.array(pts[tags['nose_c'][0]])
for k, (rr, n) in enumerate(NOSE_LOOPS):
    a = np.linspace(0, 2 * PI, n, endpoint=False) + .3 * k
    _ref = to_dom(surf_dir(rr * W * np.cos(a), NZ + rr * W * np.sin(a)))
    rd = float(np.median(np.linalg.norm(_ref - _nc, axis=1)))
    if k: rd = max(rd, _rd_prev * 1.3)
    _rd_prev = rd
    add_loop(_nc + rd * np.stack([np.cos(a), np.sin(a)], -1), 'nose_%d' % k)
MOUTH_LOOPS = [(.100, .016, .024), (.112, .019, .031), (.124, .022, .038)]
for k, (hx, ht, hb) in enumerate(MOUTH_LOOPS):
    a = np.linspace(0, 2 * PI, 32, endpoint=False)
    add_loop(to_dom(surf_dir(hx * W * spow(np.cos(a), .8), MC + np.where(np.sin(a) > 0, ht, hb) * W * np.sin(a))), 'mouth_%d' % k)
NB = 12; AB = math.radians(176)
psiB = np.linspace(0, 2 * PI, NB, endpoint=False)
dB = np.stack([np.sin(AB) * np.cos(psiB), -np.cos(AB) * np.ones(NB), np.sin(AB) * np.sin(psiB)], -1)
add_loop(to_dom(dB), 'bound')
# fill: a dense Fibonacci set of directions thinned to a spacing field (fine on the face band, medium on the face and
# crown, coarser on the back), deterministic greedy order; spacings ~15 % coarser than Kome's (the 22k townsfolk budget)
NF = 60000; ii = np.arange(NF) + .5
phi = np.arccos(1 - 2 * ii / NF); th = PI * (1 + 5 ** .5) * ii
D = np.stack([np.sin(phi) * np.cos(th), np.sin(phi) * np.sin(th), np.cos(phi)], -1)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1)); D = D[alpha < math.radians(173.5)]
Pf = radial_hit(D); q = M2L(Pf)
alpha = np.arccos(np.clip(-D[:, 1], -1, 1))
fband = smooth(.50, .40, np.abs(q[:, 0])) * smooth(.08, .14, q[:, 2]) * smooth(.60, .54, q[:, 2]) * smooth(math.radians(80), math.radians(66), alpha)
hsp = .0230 + (.0460 - .0230) * smooth(math.radians(100), math.radians(125), alpha)
hsp = hsp * (1 - fband) + .0136 * fband
order = np.argsort(-fband * 2 + np.arange(len(D)) / len(D), kind='stable')   # the band first, then Fibonacci order
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
keep &= ~(frontp & ((Pf[:, 0] / W) ** 2 + ((Pf[:, 2] - NZ) / W) ** 2 < .036 ** 2))
mz = (Pf[:, 2] - MC) / W
keep &= ~(frontp & ((Pf[:, 0] / (.134 * W)) ** 2 + (mz / np.where(mz > 0, .029, .046)) ** 2 < 1))
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
        verts.append(tuple(P - .0045 * SW * n + .0016 * SW * t)); vdir.append(vdir[vi]); vnorm.append(n); rr.append(i0 + k)   # rig round: the roll keeps the skin's normal (no grey ring)
    for k in range(NE):
        faces.append((rim[k], rim[(k + 1) % NE], rr[(k + 1) % NE], rr[k]))
    roll_info[s] = (rim, rr)
RIM_L = np.array([verts[i] for i in roll_info[1][0]])
vdir = unit(np.array(vdir)); vnorm = np.array(vnorm)
fuv = head_uv(vdir); buv = headback_uv(vdir)
face_uvs = []
NOSE_CH = .085          # the nose button's own front-projected chart (half-size in W)
_VA = np.array(verts); _nose_v = (_VA[:, 1] < HY) & (np.hypot(_VA[:, 0] / W, (_VA[:, 2] - NZ) / W) < .068) & (vnorm[:, 1] < -.35)   # forward-facing only
def nose_uv(i): return au('nose', .5 + _VA[i, 0] / (2 * NOSE_CH * W), .5 + (_VA[i, 2] - NZ) / (2 * NOSE_CH * W))
LOG['nose_chart_faces'] = 0
for f in faces:
    a = math.acos(float(np.clip(-vdir[list(f)].mean(0)[1] / np.linalg.norm(vdir[list(f)].mean(0)), -1, 1)))
    if all(_nose_v[i] for i in f):
        face_uvs.append(tuple(nose_uv(i) for i in f)); LOG['nose_chart_faces'] += 1
    elif a < A_SPLIT: face_uvs.append(tuple(tuple(au('head', *fuv[i])) for i in f))
    else: face_uvs.append(tuple(tuple(au('headback', *buv[i])) for i in f))
skin = mesh('cat_head_skin', verts, faces, face_uvs, 'head', 'head', raw_uv=True, normals=vnorm)
LOG['skin_vertices'] = len(verts); LOG['skin_faces'] = len(faces)

# ============================================================== EYES: flush lens globes following the ball
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
                              'down_deg': round(math.degrees(math.asin(-axis[2])), 1)}

# ============================================================== LASH RIBBONS: the upper lash line + one wing flick
# The sheet: ~0.021 W thick over the top, ~0.03 W at the outer upper corner, running down the outer side to ~0.5 of the
# half-height below the eye's middle, one chunky wing flick at the outer top. A flattened tapered tube lying on the skin,
# its inner edge just inside the lid hole, <= 0.009 W proud. Separate objects (origin at the eye centre) for the lids.
LASH_PSI = np.radians(np.linspace(158, -50, 30))         # inner top -> over the top -> down the outer side
LTH0, LTH1 = CFG['LASH']
def lash_th(psi):      # thickness in eye-radius units (the opening's superellipse radius)
    d = np.degrees(psi)
    th = LTH0 + LTH1 * np.exp(-((d - 35) / 30) ** 2)
    th = th * (1 - .58 * smooth(22, -38, d))
    return th * smooth(160, 128, d) * smooth(-53, -10, d) + .02
LASH_WINGS = [CFG['WING']]
def eye_pt(s, X, Z):
    """eye units (X > 0 outer) -> skin point, its normal"""
    x = s * EX + s * EHW * np.asarray(X, float); z = EZ + EHH * np.asarray(Z, float)
    y = front_hit(x, z); S = np.stack([x, y, z], -1); return S, grad_n(S)
def ribbon(C, n, hw, hp, NLS=8, embed=.0012 * W):
    """flattened lens-section tube along skin points C with skin normals n; returns verts, faces, normals, uv-v"""
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
    hp = (.0085 * W) * (.55 + .45 * smooth(0, .25, tt)) * (1 - .55 * smooth(.70, 1.0, tt))
    V, F, NV, NLS = ribbon(Cm, nm, hw, hp, NLS=7)
    allV = [V]; allF = [F]; allN = [NV]; off = len(V)
    for (rpsi, rk), (tx, tz) in LASH_WINGS:
        rp = math.radians(rpsi); rux, ruz = eye_unit(np.array([rp]))
        thr = lash_th(np.array([rp]))[0]
        R0 = np.array([rux[0] * (k_in + thr * .45), ruz[0] * (k_in + thr * .45)])
        T0 = np.array([tx, tz])
        mid = R0 + (T0 - R0) * .5 + np.array([-.04, .07])         # a slight upward curl
        ws = np.linspace(0, 1, 10)
        XZ = np.array([(1 - w) ** 2 * R0 + 2 * (1 - w) * w * mid + w * w * T0 for w in ws])
        Cw, nw = eye_pt(s, XZ[:, 0], XZ[:, 1])
        hww = (.0150 * W) * (1 - ws) ** .85 + .0013 * W      # the sheet's single wing is chunky at its root
        hpw = (.0078 * W) * (1 - .72 * ws)
        Vw, Fw, NVw, _ = ribbon(Cw, nw, hww, hpw, NLS=6)
        allV.append(Vw); allF.append([tuple(i + off for i in f) for f in Fw]); allN.append(NVw); off += len(Vw)
    V = np.vstack(allV); NV = np.vstack(allN); F = [f for FF in allF for f in FF]
    ax_ = eye_axes[tag]; fac = clamp(.5 + .5 * (NV @ ax_))
    uvs = [tuple((.5, float(fac[i])) for i in f) for f in F]
    mesh('lash_line.' + tag, V, F, uvs, 'lash', 'lash.' + tag, normals=NV)
    lash_info[tag] = dict(top=[float(v) for v in Cm[np.argmax(Cm[:, 2])]], outer_end=[float(v) for v in Cm[-1]],
                          max_proud_W=round(float(hp.max() / W), 4), thick_top_W=round(float(2 * hw[np.argmax(Cm[:, 2])] / W), 4))
LOG['lash'] = lash_info

# ============================================================== B: the bandana ring's placement (built after the ears)
HAS_BAND = DESIGN == 'b'
BAND_ZF, BAND_ZB, BAND_H, BAND_T = .910, .800, .092, .0135     # front / back centre-line heights, height, thickness (m)
def band_zc(phi): return BAND_ZF + (BAND_ZB - BAND_ZF) * (1 - np.cos(phi)) / 2
def ear_tuck(V):
    """below the band's top edge no ear point stands further out (horizontally, from the head's axis) than the head
    surface + 10 mm, so the band (24 mm thick, hugging the head) covers the root and its top edge stays one clean line"""
    V = np.array(V, float); phi_ = np.arctan2(V[:, 0], -(V[:, 1] - HY))
    ztop = band_zc(phi_) + BAND_H / 2
    wv = smooth(ztop + .034, ztop - .010, V[:, 2]); sel = wv > 0
    if sel.any():
        Dh = np.stack([np.sin(phi_[sel]), -np.cos(phi_[sel]), np.zeros(sel.sum())], -1)
        Ch = np.stack([np.zeros(sel.sum()), np.full(sel.sum(), HY), V[sel, 2]], -1)
        Hh = ray_hit(Ch, Dh, head_sdf, 0., .6); rh = np.linalg.norm(Hh[:, :2] - Ch[:, :2], axis=1)
        rv = np.linalg.norm(V[sel, :2] - Ch[:, :2], axis=1)
        new_r = rv - wv[sel] * np.maximum(rv - (rh + .005), 0)
        dirh = (V[sel, :2] - Ch[:, :2]) / np.maximum(rv, 1e-9)[:, None]
        V[sel, :2] = Ch[:, :2] + dirh * new_r[:, None]
    return V, wv

# ============================================================== EARS: rounded-triangle wedges growing out of the head's upper corners
# (round 2, the director: taller, flatter wedges with a softly curved front, the outer edge continuing the head's side
# silhouette, a recessed inner panel.) The ear is a flattened closed blob whose equator is the sheet's ear outline traced in
# the front view (her left ear; W units, x out, z above the chin; its low part is buried in the skull): each point is
# P(theta, phi) = the outline point pulled toward a centre by cos(phi)^0.55 on the ear's mid-plane, pushed off it by
# sin(phi)^0.85 * T(z)/2 (front +, back -); the front inside the rim band sinks into a soft-walled panel.
EARC = CFG['EARW']
def chaikin(P, it=3):
    P = np.asarray(P, float)
    for _ in range(it):
        Q = np.roll(P, -1, 0); P = np.stack([.75 * P + .25 * Q, .25 * P + .75 * Q], 1).reshape(-1, 2)
    return P
def resample_closed(P, n):
    Q = np.vstack([P, P[:1]]); d = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(Q, axis=0), axis=1))])
    t = np.linspace(0, d[-1], n, endpoint=False); return np.stack([np.interp(t, d, Q[:, 0]), np.interp(t, d, Q[:, 1])], -1)
EAR_NO = 46
EAR_OUT = resample_closed(chaikin(EARC['out'], 3), EAR_NO)                # 2D outline (x, z), W units, her left ear
EAR_C2 = np.array(EARC['c2'])
EAR_PHI = np.radians([-90, -68, -48, -33, -21, -11, -4, 0, 4, 11, 19, 27, 34, 40, 45, 50, 56, 64, 75, 90])
EAR_RIN = 1 - EARC['rim'] / np.linalg.norm(EAR_OUT - EAR_C2, axis=1)       # the panel's edge (outline fraction) per column
EAR_TIPZ = float(EAR_OUT[:, 1].max())
def ear_T(z): return EARC['T1'] + (EARC['T0'] - EARC['T1']) * (1 - smooth(EARC['zt'], EAR_TIPZ, z))
def ear_fade(z): return smooth(EARC['zp'], EARC['zp'] + .08, z) * (1 - smooth(EAR_TIPZ - .045, EAR_TIPZ - .012, z))
def ear_plane(s):
    ps, la = math.radians(EARC['yaw']), math.radians(EARC['lean'])
    n = unit(np.array([s * math.sin(ps), -math.cos(ps), math.sin(la)]))
    Pc = L2M(np.array([s * EAR_C2[0], EARC['yc'], EAR_C2[1]]))
    return n, Pc
def ear_point(s, ti, phi):
    """ti: outline column (int array), phi: angle (array) -> metres"""
    n, Pc = ear_plane(s)
    o = EAR_OUT[ti]; g = np.cos(phi) ** .55
    q = EAR_C2 + (o - EAR_C2) * g[:, None]
    xm = s * q[:, 0] * W; zm = CHIN + q[:, 1] * W
    ym = Pc[1] - (n[0] * (xm - Pc[0]) + n[2] * (zm - Pc[2])) / n[1]
    M = np.stack([xm, ym, zm], -1)
    h = np.sign(np.sin(phi)) * np.abs(np.sin(phi)) ** .85
    off = h * ear_T(q[:, 1]) * W / 2
    rin = EAR_RIN[ti]
    dish = EARC['dish'] * W * (1 - smooth(rin - .10, rin - .012, g)) * ear_fade(q[:, 1]) * (phi > 0)
    return M + n[None, :] * (off - dish)[:, None]
ear_info = {}
for s in (-1, 1):
    tag = 'L' if s > 0 else 'R'
    NO, NP = EAR_NO, len(EAR_PHI)
    V = [tuple(ear_point(s, np.array([0]), np.array([EAR_PHI[0]]))[0])]
    for j in range(1, NP - 1):
        Pj = ear_point(s, np.arange(NO), np.full(NO, EAR_PHI[j]))
        V.extend([tuple(p) for p in Pj])
    V.append(tuple(ear_point(s, np.array([0]), np.array([EAR_PHI[-1]]))[0]))
    ix = lambda j, i: 1 + (j - 1) * NO + i % NO
    vv = lambda j: (EAR_PHI[j] + PI / 2) / PI
    fs = []; uvf = []
    for i in range(NO):
        fs.append((0, ix(1, i + 1), ix(1, i))); uvf.append((((i + .5) / NO, 0.), ((i + 1) / NO, vv(1)), (i / NO, vv(1))))
    for j in range(1, NP - 2):
        for i in range(NO):
            fs.append((ix(j, i), ix(j, i + 1), ix(j + 1, i + 1), ix(j + 1, i)))
            uvf.append(((i / NO, vv(j)), ((i + 1) / NO, vv(j)), ((i + 1) / NO, vv(j + 1)), (i / NO, vv(j + 1))))
    last = len(V) - 1
    for i in range(NO):
        fs.append((ix(NP - 2, i), ix(NP - 2, i + 1), last)); uvf.append(((i / NO, vv(NP - 2)), ((i + 1) / NO, vv(NP - 2)), ((i + .5) / NO, 1.)))
    if HAS_BAND:
        V, wtuck = ear_tuck(V); LOG['ear_tucked_' + tag] = int((wtuck > .02).sum())
    mesh('cat_ear.' + tag, V, fs, uvf, 'ear.' + tag, 'ear.' + tag)
    # the frame the rig and the paint use: the tip, the point where the ear leaves the skull, the axis between
    ti = int(np.argmax(EAR_OUT[:, 1])); T = ear_point(s, np.array([ti]), np.array([0.]))[0]
    n, Pc = ear_plane(s); lo, hi = 0., 1.
    for _ in range(40):
        m = (lo + hi) / 2
        if head_sdf((T + (Pc - T) * m)[None])[0] < 0: hi = m
        else: lo = m
    S = T + (Pc - T) * hi; w = unit(T - S)
    ear_info[s] = dict(T=T, S=S, C=S, w=w, n=n)
    LOG['ear_' + tag] = {'tip_m': [round(float(c), 4) for c in T], 'base_on_skin_m': [round(float(c), 4) for c in S],
                         'L_W': round(float(np.linalg.norm(T - S)) / W, 3)}

# ============================================================== B: THE BANDANA (a thick soft ring tilted back, knot, tabs)
# sheet (measure-b.md): centre line z 0.91 m in front, 0.80 m at the back (~11.5 deg), 0.092 m tall, ~0.024 m thick;
# under the ears (their roots tuck under it), the crown left bare; a rounded knot on the back with two broad short tabs
KNOT_C = None; TAB_INFO = {}
if HAS_BAND:
    def band_field(p): return head_sdf(p)
    NBP = 64; NBS = 14
    phis = np.linspace(0, 2 * PI, NBP, endpoint=False)
    sa_b = np.linspace(0, 2 * PI, NBS, endpoint=False)
    sec_db = BAND_H / 2 * spow(np.sin(sa_b), .30); sec_dn = (BAND_T + .004) / 2 * spow(np.cos(sa_b), .62) + (BAND_T - .004) / 2
    G = np.zeros((NBP, NBS, 3))
    Dh = np.stack([np.sin(phis), -np.cos(phis), np.zeros_like(phis)], -1)
    for j in range(NBS):
        Cz = np.stack([np.zeros_like(phis), np.full_like(phis, HY), band_zc(phis) + sec_db[j]], -1)
        P = ray_hit(Cz, Dh, band_field, 0., .6); N = grad_n(P, band_field)
        G[:, j] = P + N * sec_dn[j]
    dK = np.roll(G, -1, 0) - np.roll(G, 1, 0); dS = np.roll(G, -1, 1) - np.roll(G, 1, 1)
    NG = unit(np.cross(dK, dS)); ctr = np.repeat(G.mean(1, keepdims=True), NBS, 1)
    NG = np.where(((NG * (G - ctr)).sum(-1) < 0)[..., None], -NG, NG)
    Fb = []; UVb = []
    for i in range(NBP):
        for j in range(NBS):
            i2 = (i + 1) % NBP; j2 = (j + 1) % NBS
            Fb.append((i * NBS + j, i * NBS + j2, i2 * NBS + j2, i2 * NBS + j))
            UVb.append(((i / NBP, j / NBS), (i / NBP, (j + 1) / NBS), ((i + 1) / NBP, (j + 1) / NBS), ((i + 1) / NBP, j / NBS)))
    mesh('bandana_ring', G.reshape(-1, 3), Fb, UVb, 'band', 'band', normals=NG.reshape(-1, 3))
    BACK = G[NBP // 2]; BACK_OUT = float(BACK[:, 1].max()); BACK_Z = float(band_zc(PI))
    _up = unit(BACK[np.argmax(BACK[:, 2])] - BACK[np.argmin(BACK[:, 2])]); _out = unit(np.array([0, 1., 0]) - _up * _up[1])
    # the knot: a plump rounded bun on the back (sheet: 0.09 m wide, ~0.07 tall, standing ~0.035 m off the band)
    KNOT_C = np.array([0, BACK_OUT + .010, BACK_Z + .010])
    KO = Matrix([[1., 0, 0], list(_out), list(_up)]).transposed()
    blob('bandana_knot', tuple(KNOT_C), (.046, .030, .040), 'knot', 'band', 20, 12, p=(.85, .9, .85), orient=KO)
    # the tabs: two broad rounded leaves from under the knot, down and a little out, lying close to the head's back
    # (sheet back view: ~0.14 m long, ~0.09 m wide at their widest, their tips at z ~0.65 m, x +-0.08 m)
    for s, tg in ((-1, 'R'), (1, 'L')):
        P0 = KNOT_C + np.array([s * .020, -.012, -.012])
        Pend = P0 + np.array([s * .078, 0., -.120])
        ctrl = []
        for t in np.linspace(0, 1, 7):
            p = P0 + (Pend - P0) * t
            # keep it close to the head: the tab's centre ~0.020 m off the skin, bulging a touch out in the middle
            hh = ray_hit(np.array([[0, HY, p[2]]]), unit(np.array([[p[0], p[1] - HY, 0.]])), head_sdf, 0., .6)[0]
            dirh = unit(np.array([p[0], p[1] - HY, 0.])); off = .022 + .012 * math.sin(PI * t) + .010 * (1 - t)
            ctrl.append(hh + dirh * off)
        path = [catmull(ctrl, t) for t in np.linspace(0, 1, 40)]
        TRB = .026
        dl = (path[-1] - path[-2]).normalized(); path += [path[-1] + dl * (TRB * k / 5) for k in range(1, 6)]
        def tab_r(s_, L, TRB=TRB):
            t = s_ / L; se = L - TRB
            r = float(np.interp(t, [0, .2, .55, .82, 1.0], [.028, .046, .056, .050, .036]))
            if s_ > se: r = min(r, TRB * math.sqrt(max(0., 1 - ((s_ - se) / TRB) ** 2)) * 1.6)
            return max(r, .0015)
        def tab_rings(L): return L * np.concatenate([np.linspace(0, .78, 12), .78 + .22 * np.sin(np.linspace(0, 1, 9)[1:] * PI / 2)])
        mid = np.array(ctrl[3]); radial = unit(np.array([mid[0], mid[1] - HY, 0.]))
        ob, TL = sweep('bandana_tab.' + tg, path, tab_r, 'cuff', 'tabs', rings=tab_rings, sides=12, ovals=lambda s_, L: (1., .30),
                       ref0=radial)
        TAB_INFO[tg] = {'root': [float(v) for v in path[0]], 'tip': [float(v) for v in path[-1]], 'length_m': round(TL, 4)}
    LOG['band'] = {'front_top_z': round(float(G[0][:, 2].max()), 4), 'front_bottom_z': round(float(G[0][:, 2].min()), 4),
                   'back_z': [round(float(BACK[:, 2].min()), 4), round(float(BACK[:, 2].max()), 4)], 'tabs': TAB_INFO}

# ============================================================== BODY AND OUTFIT
joint_arms = {}; joint_legs = {}
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
    sweep('arm.' + tag, [Sh + Dv * t for t in np.linspace(.0, t_paw - .02, 8)], lambda s_, L: arm_r, 'skin', grp, rings=8, sides=14)
    orient = Matrix([list(Pv), list(Yv), list(Dv)]).transposed()
    blob('mitten_paw.' + tag, tuple(Sh + Dv * t_paw), paw_r, 'paw', grp, 16, 10, p=(.92, .92, .92), orient=orient)
    joint_arms[tag] = {'shoulder': [float(v) for v in Sh], 'elbow': [float(v) for v in Sh + Dv * (T1 * .9)],
                       'wrist': [float(v) for v in Sh + Dv * (t_paw - .045)], 'hand': [float(v) for v in Sh + Dv * t_paw]}
    pc = Sh + Dv * t_paw
    return pc, Dv, Pv
def paw_clear(pc, Pv, paw_r, fn_ax):
    """lateral clearance between the paw's inner side and the body's half-width at the paw's height (metres)"""
    inner_x = abs(pc[0]) - abs(Pv[0]) * paw_r[0] - abs(Pv[2]) * .0
    return round(float(inner_x - fn_ax(pc[2])), 4)

if DESIGN == 'a':
    # --- the yellow shirt torso (hidden under the overalls below z .35; the top tucks up inside the head)
    TORSO = [(.300, .186, .170), (.330, .182, .168), (.360, .174, .164), (.390, .164, .158), (.420, .155, .150), (.445, .149, .146),
             (.468, .139, .138), (.490, .125, .128), (.512, .110, .114), (.540, .097, .099), (.580, .088, .088), (.620, .084, .084)]
    TOR_N = 2.3
    lathe('shirt_torso', TORSO, 'torso', 'body', 40, TOR_N, cap=(False, True))
    torso_front, torso_normal, (TOR_Z, TOR_AX, TOR_AY) = lathe_fns(TORSO, TOR_N)
    # --- the overall pants: a rolled waistband at z .35, a bean down to two short rolled cuffs (sheet: half-width
    # 0.18 at z .336, 0.21 at z .16-.27; depth +-0.18; the cuffs' hems at z 0.122)
    PANTS = [(.334, .174, .158), (.350, .186, .176), (.355, .193, .184), (.349, .197, .186), (.322, .204, .188), (.280, .210, .189),
             (.230, .212, .188), (.190, .209, .184), (.165, .200, .175), (.150, .185, .160), (.142, .150, .130), (.138, .080, .070)]
    PANTS_N = 2.3
    lathe('overall_pants', PANTS, 'pants', 'body', 40, PANTS_N, cap=(False, True))
    PANTS_OUT = sorted(PANTS[3:9], key=lambda r: r[0])
    pants_ax = lambda z: float(np.interp(z, [r[0] for r in PANTS_OUT], [r[1] for r in PANTS_OUT]))
    CUFF = [(.205, .080, .076), (.175, .090, .086), (.145, .094, .090), (.130, .095, .091), (.124, .093, .089), (.1215, .088, .084),
            (.124, .082, .078), (.136, .080, .076)]
    for s, tg in ((-1, 'R'), (1, 'L')):
        lathe('overall_cuff.' + tg, [(z, ax, ay, -.004, s * .094) for (z, ax, ay) in CUFF], 'cuff', 'body', 24, 2.2)
    # --- the bibs: thick panels on the shirt, front top z 0.418 (half-width 0.135, rounded corners), back top z 0.414
    BIB_T, BIB_GAP = .010, .003
    def bib(name, side, ztop, zbot, hw_top, hw_bot, rc):
        NR, NC = 14, 12
        zr = np.concatenate([np.linspace(zbot, ztop - rc, NR - 7), ztop - rc + rc * np.sin(np.linspace(0, 1, 8)[1:] * PI / 2)])
        hwl = hw_bot + (hw_top - hw_bot) * (zr - zbot) / (ztop - zbot)
        dz = np.clip(zr - (ztop - rc), 0, rc); hw = hwl - rc + np.sqrt(np.maximum(rc * rc - dz * dz, 0))
        hw = np.minimum(hw, np.interp(zr, TOR_Z, TOR_AX) * .97)
        cr = np.sin(np.linspace(-PI / 2, PI / 2, NC))
        X = cr[None, :] * hw[:, None]; Z = np.repeat(zr[:, None], NC, 1)
        Y = side * -torso_front(X, Z)
        S0 = np.stack([X, Y, Z], -1); Nn = torso_normal(S0.reshape(-1, 3)).reshape(S0.shape)
        MID = S0 + Nn * (BIB_GAP + BIB_T / 2)
        dzA = np.gradient(MID, axis=0); dxA = np.gradient(MID, axis=1)
        NA = unit(np.cross(dzA, dxA)); NA = np.where(((NA[..., 1:2] * side) < 0), -NA, NA)
        thick_panel(name, MID, NA, BIB_T, 'bib', 'body', (cr + 1) / 2, (zr - zbot) / (ztop - zbot))
        return MID, NA
    BIB_F = bib('overall_bib_front', -1, .418, .330, .135, .168, .022)
    BIB_B = bib('overall_bib_back', 1, .414, .330, .150, .172, .045)
    # --- the straps: two broad bands from the buttons up over the shoulders and down the back to the back bib
    STRAP_X, STRAP_HW, STRAP_T = .107, .033, .009
    BUTTON_Z = .373
    STRAPS = {}
    for s, tg in ((-1, 'R'), (1, 'L')):
        x = s * STRAP_X
        zt = float(np.interp(abs(x) / .985, TOR_AX[::-1], TOR_Z[::-1]))          # where the torso narrows to the strap
        zf = np.linspace(BUTTON_Z - .005, zt - .006, 16); zb = np.linspace(zt - .006, .398, 16)[1:]
        Cf = np.stack([np.full_like(zf, x), torso_front(x, zf), zf], -1); Cb = np.stack([np.full_like(zb, x), -torso_front(x, zb), zb], -1)
        C = np.vstack([Cf, Cb]); Nn = torso_normal(C)
        # lift the path by the bib where the strap lies on it (front below the bib top, back below the back bib top)
        onbib = np.where(C[:, 1] < 0, smooth(.424, .414, C[:, 2]), smooth(.420, .410, C[:, 2]))
        C = C + Nn * (BIB_GAP + BIB_T * onbib)[:, None]
        strip('overall_strap.' + tg, C, Nn, STRAP_HW, STRAP_T, 'band', 'body', nsec=9, embed=.002)
        STRAPS[tg] = {'top_z': round(zt, 4)}
    # --- the buttons: two big cream domes at the straps' front ends (sheet: d 0.078 m at x +-0.095, z 0.373)
    for s, tg in ((-1, 'R'), (1, 'L')):
        x = s * .095; y = float(torso_front(x, BUTTON_Z)); Sb = np.array([x, y, BUTTON_Z]); nb = torso_normal(Sb)[0]
        tx = unit(np.cross(np.array([0, 0, 1.]), nb)); ty = np.cross(nb, tx)
        c = Sb + nb * (BIB_GAP + BIB_T + STRAP_T * .55 + .006)
        blob('overall_button.' + tg, tuple(c), (.037, .037, .0125), 'knot', 'body', 16, 8, p=(.85, .85, .55),
             orient=Matrix([list(tx), list(ty), list(nb)]).transposed())
    # --- arms: short yellow sleeves, cream capsule arms, mitten paws (36 deg out: at 30 deg the paws touch the overalls)
    for s, tg in ((-1, 'R'), (1, 'L')):
        PAW_R = (.062, .056, .066)
        pc, Dv, Pv = build_arm(s, tg, np.array([s * .148, .010, .455]), math.radians(36), .12, -.050, .105, .058, .066, .043, .225, PAW_R)
        LOG['paw_clear_body_' + tg] = paw_clear(pc, Pv, PAW_R, lambda z: max(pants_ax(z), float(np.interp(z, TOR_Z, TOR_AX))))
    # --- legs and big oval feet
    for s, tg in ((-1, 'R'), (1, 'L')):
        grp = 'leg.' + tg
        sweep('stubby_leg.' + tg, [(s * .100, -.004, .200), (s * .104, -.006, .130), (s * .110, -.010, .060)], lambda s_, L: .084, 'skin', grp, rings=6, sides=14)
        blob('oval_foot.' + tg, (s * .120, -.035, .048), (.100, .130, .048), 'foot', grp, 20, 11, p=(.82, .82, .80))
        joint_legs[tg] = {'hip': [s * .100, -.004, .200], 'knee': [s * .104, -.006, .130], 'ankle': [s * .110, -.010, .065], 'toe': [s * .120, -.150, .035]}
    # --- tail: thick, from the overalls' lower back, dipping, then rising in a hook to a rounded club curling forward
    TAIL_CTRL = [(.000, .150, .200), (.012, .222, .160), (.030, .292, .166), (.032, .342, .216), (.012, .358, .284),
                 (-.022, .334, .336), (-.042, .290, .352)]
    TAIL_RB = .063
    TAIL_PROF = ([0, .30, .55, .75, .88, 1.0], [.050, .053, .057, .062, .064, .063])
    HIPS = [0, .0, .215]
else:
    # --- the pear-shaped wrap top: a rolled hem at z 0.157, narrowing under the sash, the shoulders tucking into the head
    TOP = [(.182, .244, .208), (.165, .252, .216), (.158, .259, .222), (.160, .264, .228), (.170, .266, .230), (.200, .264, .228),
           (.236, .240, .216), (.280, .232, .210), (.326, .228, .206), (.360, .220, .200), (.400, .206, .190), (.440, .188, .176),
           (.470, .165, .158), (.500, .140, .139), (.530, .116, .116), (.570, .098, .098), (.620, .092, .092)]
    TOR_N = 2.3
    lathe('wrap_top', TOP, 'torso', 'body', 44, TOR_N, cap=(False, True))
    TOP_OUT = TOP[4:]
    torso_front, torso_normal, (TOR_Z, TOR_AX, TOR_AY) = lathe_fns(TOP_OUT, TOR_N)
    NECK_V = .472           # the V of fur at the neck (sheet: the V point z 0.472, 0.12 m wide at z 0.505)
    # --- the crossed collar bands: her right panel's edge from the neck to the V, then her left panel over it, from the
    # left side of the neck down across the chest to her right hip under the sash (the sheet's main diagonal)
    def collar(name, ctrl, half_w=.0150, thick=.0062, lift=.0):
        P = np.array([[p.x, p.y] for p in [catmull(ctrl, t) for t in np.linspace(0, 1, 26)]])
        C = np.stack([P[:, 0], torso_front(P[:, 0], P[:, 1]), P[:, 1]], -1); Nn = torso_normal(C)
        C = C + Nn * lift
        return strip(name, C, Nn, half_w, thick, 'bib', 'body', nsec=8, embed=.0015)
    collar('collar_under', [(-.092, .552), (-.080, .528), (-.056, .503), (-.026, .484), (.000, NECK_V), (.022, .458)])
    collar('collar_over', [(.092, .552), (.080, .528), (.056, .503), (.026, .484), (.000, NECK_V), (-.034, .446), (-.072, .410),
                           (-.110, .370), (-.140, .330), (-.158, .300)], lift=.0018)
    # --- the sash: one thick teal ring, z 0.236-0.326 (sheet 0.09 m tall, 0.48 m wide in front), continuous round the back
    SASH = [(.230, .228, .207), (.236, .241, .219), (.244, .247, .225), (.281, .246, .225), (.318, .242, .221), (.326, .236, .215),
            (.332, .224, .203)]
    lathe('teal_sash', SASH, 'pants', 'body', 44, 2.3)
    sash_ax = lambda z: float(np.interp(z, [r[0] for r in SASH[1:6]], [r[1] for r in SASH[1:6]]))
    # --- arms: short wide sleeves, ginger capsule arms, mitten paws (38 deg out: her wide pear body)
    for s, tg in ((-1, 'R'), (1, 'L')):
        PAW_R = (.064, .058, .066)
        pc, Dv, Pv = build_arm(s, tg, np.array([s * .190, .005, .455]), math.radians(38), .12, -.065, .115, .068, .080, .046, .235, PAW_R)
        LOG['paw_clear_body_' + tg] = paw_clear(pc, Pv, PAW_R, lambda z: max(sash_ax(z) if .236 < z < .326 else 0, float(np.interp(z, [r[0] for r in TOP_OUT], [r[1] for r in TOP_OUT]))))
    # --- very short ginger legs and oval feet
    for s, tg in ((-1, 'R'), (1, 'L')):
        grp = 'leg.' + tg
        sweep('stubby_leg.' + tg, [(s * .128, .000, .270), (s * .132, -.002, .160), (s * .138, -.006, .060)], lambda s_, L: .092, 'skin', grp, rings=6, sides=14)
        blob('oval_foot.' + tg, (s * .147, -.030, .047), (.108, .125, .047), 'foot', grp, 20, 11, p=(.82, .82, .80))
        joint_legs[tg] = {'hip': [s * .128, .000, .230], 'knee': [s * .132, -.002, .140], 'ankle': [s * .138, -.006, .065], 'toe': [s * .147, -.145, .035]}
    # --- tail: thick, from under the hem at the back, dipping, then rising in a hook to a cream-tipped club
    TAIL_CTRL = [(.000, .120, .175), (.025, .200, .108), (.055, .275, .112), (.066, .345, .175), (.045, .372, .262),
                 (.010, .352, .330), (-.022, .310, .352)]
    TAIL_RB = .054
    TAIL_PROF = ([0, .30, .55, .75, .88, 1.0], [.045, .047, .050, .053, .055, .054])
    HIPS = [0, .0, .230]

tpath = [catmull(TAIL_CTRL, t) for t in np.linspace(0, 1, 70)]
dl = (tpath[-1] - tpath[-2]).normalized()
tpath += [tpath[-1] + dl * (TAIL_RB * k / 6) for k in range(1, 7)]
def tail_r(s, L):
    t = s / L; se = L - TAIL_RB
    r = float(np.interp(t, *TAIL_PROF))
    if s > se: r = min(r, TAIL_RB * math.sqrt(max(0., 1 - ((s - se) / TAIL_RB) ** 2)))
    return max(r, .0015)
def tail_rings(L):
    return L * np.concatenate([np.linspace(0, .80, 20), .80 + .20 * np.sin(np.linspace(0, 1, 13)[1:] * PI / 2)])
tail_ob, TAIL_L = sweep('hook_tail', tpath, tail_r, 'tail', 'tail', rings=tail_rings, sides=14, caps=(True, True))
TAIL_JOINTS = [[float(v) for v in catmull(TAIL_CTRL, t)] for t in (0, .25, .5, .75, 1.0)]

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
def smax(a, b, k): return -smin(-a, -b, k)

# A: the peach patch (W units, front projection, her LEFT = +x), traced on the sheet's HEAD FRONT (measure/m3_patch.py):
# the inner border runs down the forehead just right of the middle (x 0.005-0.03), curves to the eye's inner lower corner,
# follows the eye's lower rim (under the eye is cream), then from the outer lower corner down to the jaw at z ~0.2. Behind
# the face it covers her whole left upper skull: on the back a diagonal from the crown's middle to her left side at
# z ~0.2 (the back view), and on the side a lower border at z ~0.19 (the side view).
_eps = np.radians(np.linspace(196, 334, 16)); _uex, _uez = eye_unit(_eps)
_EYE_LOW = [(_ex + _ehw * 1.04 * a, _ez + _ehh * 1.04 * b) for a, b in zip(_uex, _uez)]
PATCH_FACE = ([(.012, 1.10), (.010, .72), (.006, .60), (.005, .55), (.005, .50), (.008, .465), (.012, .440), (.016, .420),
               (.022, .400), (.030, .378), (.040, .355), (.052, .335), (.064, .318), (.076, .304), (.088, .292)] + _EYE_LOW +
              [(.330, .272), (.348, .259), (.368, .245), (.390, .231), (.416, .216), (.440, .207), (.462, .201), (.490, .197),
               (.62, .19), (.80, .19), (.80, 1.10)])
def patch_alpha(q, aa=.0045):
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    dF = poly_sd(x, z, PATCH_FACE)
    dB = np.maximum(((.665 - z) - x) * .7071, .195 - z)          # the back: x > 0.665 - z, above z 0.195
    t = smooth(-.10, .12, y)
    d = dF * (1 - t) + dB * t
    return 1 - smooth(-aa, aa, d)
# B: the cream muzzle (W units, front projection, symmetric): a bell from the nose bridge to under the chin
MUZ_R = [(0, .266), (.030, .263), (.052, .255), (.078, .240), (.099, .224), (.122, .209), (.145, .194), (.166, .179),
         (.186, .164), (.202, .149), (.214, .134), (.223, .119), (.229, .104), (.232, .089), (.230, .074), (.216, .059),
         (.196, .046), (.168, .030), (.130, .018), (.080, .010), (0, .006)]
MUZ = MUZ_R + [(-x, z) for (x, z) in MUZ_R[::-1][1:-1]]
def muzzle_alpha(q, aa=.0045):
    x, y, z = q[:, 0], q[:, 1], q[:, 2]
    d = poly_sd(x, z, MUZ)
    return (1 - smooth(-aa, aa, d)) * smooth(.10, -.05, y)
def band_q(P):
    """signed distance (m, along z) from the band's centre line; |band_q| < BAND_H/2 is under the band"""
    phi = np.arctan2(P[:, 0], -(P[:, 1] - HY)); return P[:, 2] - band_zc(phi)
def paint_head(d): return paint_head_P(radial_hit(d))
def paint_head_P(P):
    n = grad_n(P)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; q = M2L(P); zr = q[:, 2]
    fr = smooth(HY + .03, HY - .07, y)
    if DESIGN == 'a':
        pa = patch_alpha(q)
        C = mix(np.broadcast_to(rgb('fur'), (len(x), 3)), rgb('patch'), pa)
        shade = mix(rgb('furshade'), rgb('patchshade'), pa)
        C = mix(C, rgb('#ffeadc'), .18 * fr * (1 - smooth(.10, .30, zr)) * (1 - pa))
    else:
        ma = muzzle_alpha(q)
        C = mix(np.broadcast_to(rgb('fur'), (len(x), 3)), rgb('cream'), ma)
        shade = mix(rgb('furshade'), rgb('creamshade'), ma)
        C = mix(C, rgb('furlight'), .30 * smooth(.25, .85, n[:, 2]) * (1 - ma))          # a soft light on the crown
    # soft painted shade: under the jaw toward the neck, the jaw's sides
    under = smooth(-.25, -.85, n[:, 2]) * (1 - smooth(.10, .26, zr))
    C = mix(C, shade, .80 * under * (1 - .55 * ma if DESIGN == 'b' else 1))
    jaw = smooth(.40, .85, np.abs(n[:, 0])) * (1 - smooth(.16, .46, zr))
    C = mix(C, shade, .50 * jaw)
    sides = smooth(.35, .95, np.abs(n[:, 0]) + .6 * clamp(n[:, 1])) * (1 - smooth(.55, .85, n[:, 2]))
    C = mix(C, shade, .30 * sides)
    if HAS_BAND:
        bq = np.abs(band_q(P)); C = mix(C, shade, .30 * smooth(BAND_H / 2 + .020, BAND_H / 2 + .002, bq))
    for s in (-1, 1):
        ei = ear_info[s]; dd = np.linalg.norm(P - ei['S'], axis=1)
        C = mix(C, shade, .18 * np.exp(-(dd / (.11 * W)) ** 2))
    # nose: a soft rounded inverted triangle with one small soft highlight on its top
    nx = x / W; nzz = (z - CHIN) / W
    hwN, ztN, zbN = CFG['NOSE_TRI']
    tri = poly_sd(nx, nzz, [(-hwN, ztN), (hwN, ztN), (0, zbN)]) - .0108
    fwd = smooth(-.85, -.55, n[:, 2])
    bump = 1 - smooth(.003, .010, nose_sdf(q))              # on the nose button itself (its underside too: no pale streak)
    C = mix(C, rgb('nose'), (1 - smooth(-.0022, .0022, tri)) * fr * (nzz > zbN - .03) * np.maximum(fwd, bump))
    hl = np.exp(-(((nx + .008) / .0100) ** 2 + ((nzz - (ztN + .0015)) / .0052) ** 2))
    C = mix(C, rgb('noseh'), .50 * hl * fr * (1 - smooth(-.002, .002, tri)))
    # blush ovals (soft)
    bx, bz, bw, bh = BLUSH
    for s in (-1, 1):
        r = np.sqrt(((x - s * bx) / bw) ** 2 + ((z - bz) / bh) ** 2)
        C = mix(C, rgb('blush'), .82 * (1 - smooth(.50, 1.08, r)) * fr)
    # brows: soft thin arcs tapering to rounded points
    bxW, bzW, bl, brise, bth = CFG['BROW']
    t = np.linspace(-1, 1, 15)
    for s in (-1, 1):
        Pb = np.stack([s * BROW_X + s * bl * W * t, BROW_Z + brise * W * (1 - t * t) - brise * .5 * W - .004 * W * s * s * t], -1)
        half = bth * W * np.maximum(0, 1 - t * t) ** .55 + .0024 * W
        box = fr * ((np.abs(x - s * BROW_X) < .10 * W) & (np.abs(z - BROW_Z) < .05 * W))
        a = np.zeros(len(x)); ib = box > 0
        a[ib] = stroke(x[ib], z[ib], Pb, half, .0030 * W)
        C = mix(C, rgb('brow'), .95 * a * fr)
    # mouth: the sheet's cat "w" (two arcs from the centre to the corners) and the line up to the nose
    tl = np.linspace(0, 1, 21)
    ib = (fr > 0) & (np.abs(x) < .12 * W) & (np.abs(z - (CHIN + MOUTH['zc'] * W)) < .07 * W)
    a = np.zeros(len(x))
    for s in (-1, 1):
        ax_ = s * MHW * tl; az_ = CHIN + (MOUTH['zc'] + (MOUTH['zk'] - MOUTH['zc']) * tl - 4 * MOUTH['D'] * tl * (1 - tl)) * W
        Pm = np.stack([ax_, az_], -1); half = (.0068 - .0012 * tl ** 2) * W
        a[ib] = np.maximum(a[ib], stroke(x[ib], z[ib], Pm, half, .0026 * W))
    Pp = np.array([[0, CHIN + MOUTH['phil'] * W], [0, CHIN + MOUTH['zc'] * W]])
    a2 = np.zeros(len(x)); a2[ib] = stroke(x[ib], z[ib], Pp, np.array([.0050 * W, .0056 * W]), .0026 * W)
    C = mix(C, rgb('mouth'), .95 * np.maximum(a, a2))
    return C

IRIS = CFG['IRIS']
def paint_eye(U, V, s):
    X = (U - .5) * 2.4; Z = (V - .5) * 2.4
    sr = (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN)
    ix = -s * IRIS['ix']; iz = .0; irx = IRIS['irx']; irz = IRIS['irz']
    C = mix(rgb('#fff8ef'), rgb('#e9dfdc'), .45 * smooth(.35, .98, Z))
    C = mix(C, rgb('#efe6e4'), .25 * smooth(.3, 1., s * X))
    ex = (X - ix) / irx; ez = (Z - iz) / irz; r = np.sqrt(ex * ex + ez * ez)
    I = mix(rgb('iris0'), rgb('iris1'), smooth(-.85, -.25, ez))         # light at the bottom, deep at the top
    I = mix(I, rgb('iris2'), smooth(-.15, .45, ez))
    I = mix(I, rgb('iris3'), smooth(.45, .95, ez) * .8)
    I = mix(I, rgb('iris3'), smooth(.82, 1.0, r) * .65)
    I = I * (1 - .025 * (.5 + .5 * np.sin(np.arctan2(ez, ex) * 26 + r * 9)))[..., None]
    C = mix(C, I, 1 - smooth(.985, 1.015, r))
    px_ = ix; pz = .01; R = np.sqrt(((X - px_) / (IRIS['pw'] * irx)) ** 2 + ((Z - pz) / (IRIS['ph'] * irz)) ** 2)
    C = mix(C, rgb('pupil'), 1 - smooth(.985, 1.015, R))
    clx, clz, clw, clh = IRIS['cl']
    big = np.sqrt(((X - (-s * clx)) / clw) ** 2 + ((Z - clz) / clh) ** 2)
    small = np.sqrt(((X - (s * .05)) / .070) ** 2 + ((Z + .40) / .075) ** 2)
    C = mix(C, rgb('#fffbf6'), np.maximum(1 - smooth(.90, 1.06, big), .80 * (1 - smooth(.80, 1.10, small))))
    C = mix(C, rgb('lash'), .85 * smooth(.92, 1.0, sr) * smooth(-.30, .30, Z))      # lid contact under the lash ribbon
    return C

def paint_ear(U, V, s):
    """u = the outline column, v = (phi + 90 deg) / 180: the front inside the rim band is the inner panel"""
    ti = np.clip(U * EAR_NO, 0, EAR_NO - 1e-6); i0 = ti.astype(int); fa = ti - i0; i1 = (i0 + 1) % EAR_NO
    rin = EAR_RIN[i0] * (1 - fa) + EAR_RIN[i1] * fa
    oz = EAR_OUT[i0, 1] * (1 - fa) + EAR_OUT[i1, 1] * fa
    phi = (V - .5) * PI; g = np.cos(phi) ** .55; z = EAR_C2[1] + (oz - EAR_C2[1]) * g
    front = smooth(.50, .53, V)
    m = front * (1 - smooth(rin - .030, rin - .012, g)) * ear_fade(z)
    deep = (1 - smooth(rin - .30, rin - .05, g)) * (1 - smooth(EAR_TIPZ - .14, EAR_TIPZ - .03, z))
    if DESIGN == 'a':
        outer_c, outer_s = ('patch', 'patchshade') if s > 0 else ('fur', 'furshade')
        inn, innd = ('innerP', 'innerPdeep') if s > 0 else ('inner', 'innerdeep')
    else:
        outer_c, outer_s, inn, innd = 'fur', 'furshade', 'inner', 'innerdeep'
    C = mix(rgb(outer_c), rgb(outer_s), .35 * (1 - smooth(EARC['zp'], EARC['zp'] + .12, z)) + .20 * (1 - front))
    P_ = mix(rgb(inn), rgb(innd), .55 * deep)
    return mix(C, P_, m)

def fur_chart(chart, U, V):
    """arms, legs, paws, feet: the body fur with warm shading"""
    C = np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()
    if chart == 'skin':     # warm shade on the backs (+Y is u = .75 on these tubes) and at the roots
        back = np.exp(-((U - .75) / .17) ** 2)
        C = mix(C, rgb('furshade'), np.clip(.55 * back + .35 * (1 - smooth(.0, .35, V)), 0, 1))
    if chart == 'paw':
        back = np.exp(-(np.minimum(U, 1 - U) / .16) ** 2)
        C = mix(C, rgb('furshade'), .45 * back)
        for du in (-.045, .045):
            C = mix(C, rgb('line'), .85 * np.exp(-((U - (.5 + du)) / .010) ** 2) * smooth(.66, .76, V) * (1 - smooth(.93, .985, V)))
        C = mix(rgb('furshade'), C, .55 + .45 * smooth(.0, .30, V))
    if chart == 'foot':     # two toe lines over the front of the foot
        for du in (-.040, .040):
            C = mix(C, rgb('line'), .90 * np.exp(-((U - (.5 + du)) / .0085) ** 2) * smooth(.30, .40, V) * (1 - smooth(.66, .78, V)))
        C = mix(C, rgb('furshade'), .60 * (1 - smooth(.02, .10, V)))
    return C

def lathe_z(V, rows): return np.interp(V, np.linspace(0, 1, len(rows)), [r[0] for r in rows])
def paint(chart, U, V):
    if chart == 'head': return paint_head(head_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'headback': return paint_head(headback_uv_dir(U.ravel(), V.ravel())).reshape(U.shape + (3,))
    if chart == 'eye.L': return paint_eye(U, V, 1)
    if chart == 'eye.R': return paint_eye(U, V, -1)
    if chart == 'ear.L': return paint_ear(U, V, 1)
    if chart == 'ear.R': return paint_ear(U, V, -1)
    if chart in ('skin', 'paw', 'foot'): return fur_chart(chart, U, V)
    if chart == 'nose':     # front-projected: each texel painted at its true surface point
        x = (U.ravel() - .5) * 2 * NOSE_CH * W; z = NZ + (V.ravel() - .5) * 2 * NOSE_CH * W
        P = np.stack([x, front_hit(x, z), z], -1); return paint_head_P(P).reshape(U.shape + (3,))
    if chart == 'lash': return mix(rgb('lash'), rgb('#4a3830'), .40 * smooth(.60, .95, V))
    if chart == 'cavity': return mix(rgb('#5a1e22'), rgb('#3e1418'), .5 * smooth(.3, 1, V))
    if chart == 'tongue': return mix(rgb('#e88a96'), rgb('#f2a2ac'), .5 * smooth(.2, .9, V))
    if chart.startswith('lid'): return np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()      # painted by the rig
    a = U * 2 * PI
    if DESIGN == 'a':
        if chart == 'torso':
            z = lathe_z(V, TORSO)
            C = mix(rgb('shirt'), rgb('shirtlight'), .40 * smooth(.40, .50, z) * smooth(-.3, .9, -np.cos(a)))
            return mix(C, rgb('shirtshade'), .30 * (1 - smooth(.38, .44, z)) + .25 * smooth(.2, .9, np.cos(a)))
        if chart == 'sleeve':
            C = mix(rgb('shirt'), rgb('shirtlight'), .40 * smooth(.15, .60, V) * smooth(-.2, .8, np.sin(U * 2 * PI)))
            C = mix(C, rgb('shirtshade'), .30 * smooth(.2, .9, -np.sin(U * 2 * PI)))
            return mix(C, rgb('shirtdeep'), smooth(.74, .80, V))                  # the inside of the sleeve
        if chart == 'pants':
            z = lathe_z(V, PANTS)
            C = mix(rgb('over'), rgb('overlight'), .35 * smooth(.20, .32, z) * smooth(-.2, .9, -np.cos(a)))
            C = mix(C, rgb('overshade'), .45 * (1 - smooth(.15, .22, z)) + .25 * smooth(.3, .95, np.cos(a)))
            C = mix(C, rgb('overdeep'), .55 * (V < .18))                          # the waistband's inner fold
            C = mix(C, rgb('overshade'), .35 * np.exp(-((V - .27) / .03) ** 2))     # the crease under the waistband roll
            return C
        if chart == 'cuff':
            C = mix(rgb('over'), rgb('overshade'), .30 * smooth(.2, .9, np.cos(a)) + .25 * smooth(.30, .55, V))
            return mix(C, rgb('overdeep'), .55 * smooth(.62, .72, V))              # the rolled hem's underside / inside
        if chart == 'bib':
            fr_ = V >= .29; vv = (V - .30) / .70
            C = mix(rgb('over'), rgb('overlight'), .30 * smooth(.55, 1., vv) * fr_)
            return mix(C, rgb('overshade'), .25 * (1 - smooth(0, .4, vv)) * fr_ + .45 * (~fr_))
        if chart == 'band':     # the straps: soft across-shading
            across = np.sin(U * PI)
            return mix(rgb('overshade'), rgb('over'), smooth(.0, .6, across) * .85 + .15)
        if chart == 'knot':     # the buttons: cream domes, a soft shade toward the rim and the back
            return mix(rgb('buttonshade'), rgb('button'), smooth(.45, .80, V))
        if chart == 'tail':
            C = np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()
            C = mix(C, rgb('furshade'), .40 * (1 - smooth(.0, .25, V)))
            return mix(C, rgb('furshade'), .30 * np.exp(-((U - .5) / .2) ** 2) * smooth(.4, .8, V))
    else:
        if chart == 'torso':
            z = lathe_z(V, TOP); x = np.interp(z, TOR_Z, TOR_AX) * spow(np.sin(a), 2 / TOR_N); front = np.cos(a) < 0
            C = mix(rgb('top'), rgb('toplight'), .40 * smooth(.40, .50, z) * smooth(-.3, .9, -np.cos(a)))
            C = mix(C, rgb('topshade'), .25 * smooth(.2, .9, np.cos(a)))
            C = mix(C, rgb('topshade'), .40 * (V < .20) + .30 * np.exp(-((z - .205) / .02) ** 2))   # the hem's inside, the flare's crease
            vneck = front & (np.abs(x) < 1.8 * (z - NECK_V) + .004) & (z > NECK_V - .004)
            F_ = mix(rgb('fur'), rgb('furshade'), .35 * (1 - smooth(NECK_V, NECK_V + .05, z)))
            return mix(C, F_, vneck * 1.)
        if chart == 'sleeve':
            C = mix(rgb('top'), rgb('toplight'), .40 * smooth(.15, .60, V) * smooth(-.2, .8, np.sin(U * 2 * PI)))
            C = mix(C, rgb('topshade'), .30 * smooth(.2, .9, -np.sin(U * 2 * PI)))
            return mix(C, rgb('topdeep'), smooth(.74, .80, V))
        if chart == 'pants':    # the sash
            C = mix(rgb('sash'), rgb('sashlight'), .35 * smooth(-.3, .9, -np.cos(a)) * smooth(.25, .55, V) * (1 - smooth(.70, .85, V)))
            return mix(C, rgb('sashshade'), .45 * (1 - smooth(.10, .28, V)) + .40 * smooth(.78, .95, V) + .20 * smooth(.3, .95, np.cos(a)))
        if chart == 'bib':      # the collar bands: the top's yellow, lighter on the crest
            across = np.sin(U * PI)
            return mix(rgb('topshade'), rgb('toplight'), smooth(.0, .7, across) * .9 + .1)
        if chart == 'band':     # the bandana ring: v = round the section (0 = the outer face's middle)
            sa_ = V * 2 * PI
            return mix(rgb('bandshade'), rgb('band'), .80 * smooth(-.4, .6, np.cos(sa_)) * (1 - .30 * smooth(.3, 1., -np.sin(sa_))) + .15)
        if chart == 'knot':
            C = mix(rgb('bandshade'), rgb('band'), smooth(.25, .65, V))
            return mix(C, rgb('bandlight'), .45 * smooth(.6, .95, V) * smooth(-.2, .8, -np.cos(a)))
        if chart == 'cuff':     # the bandana's tabs (sweep: u round the section, v along)
            C = mix(rgb('band'), rgb('bandlight'), .35 * smooth(.0, .8, np.cos(a)))
            return mix(C, rgb('bandshade'), .40 * smooth(.0, .9, -np.cos(a)) + .30 * (1 - smooth(.0, .25, V)))
        if chart == 'tail':     # ginger with a cream tip that wraps the whole end (a soft wavy border)
            C = np.broadcast_to(rgb('fur'), U.shape + (3,)).copy()
            C = mix(C, rgb('furshade'), .35 * (1 - smooth(.0, .25, V)))
            s_ = V * TAIL_L; sb = TAIL_L * .755 + .012 * np.cos(U * 2 * PI * 2 - .6) + .008 * np.cos(U * 2 * PI * 3 + 1.)
            return mix(C, mix(rgb('cream'), rgb('creamshade'), .20 * (1 - smooth(sb, sb + .05, s_))), smooth(sb - .004, sb + .004, s_))
    raise KeyError(chart)

atlas = np.empty((2048, 2048, 4), np.uint8); atlas[:] = list(np.round(rgb('fur') * 255).astype(int)) + [255]
for name, (x0, y0, w, h) in CHARTS.items():
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
bs = MAT.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = .8
bs.inputs['Metallic'].default_value = 0; bs.inputs['Specular IOR Level'].default_value = .25
tx = MAT.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
MAT.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ============================================================== MEASURE (before joining)
def all_verts(obs): return np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
sk = np.array([list(v.co) for v in skin.data.vertices])
nose_tip_y = HY + NOSE_TIP_L * W
earv = all_verts(parts['ear.L'] + parts['ear.R'])
allv = all_verts([o for g in GROUPS for o in parts[g]])
rimL = RIM_L
MEAS = {'W_m': W, 'chin_z_m': CHIN, 'total_height_m': round(float(allv[:, 2].max()), 4), 'min_z_m': round(float(allv[:, 2].min()), 4),
        'width_m': round(float(np.ptp(allv[:, 0])), 4), 'depth_m': round(float(np.ptp(allv[:, 1])), 4),
        'head_width_W': round(float(np.ptp(sk[:, 0]) / W), 3),
        'crown_above_chin_W': round(float((sk[:, 2].max() - CHIN) / W), 3), 'crown_z_m': round(float(sk[:, 2].max()), 4),
        'head_depth_W': round(float(np.ptp(sk[:, 1]) / W), 3),
        'ear_tip_z_m': round(float(earv[:, 2].max()), 4), 'ear_tip_above_crown_W': round(float((earv[:, 2].max() - sk[:, 2].max()) / W), 3),
        'ear_tip_x_W': round(float(abs(earv[np.argmax(earv[:, 2]), 0]) / W), 3),
        'eye_centre_W': [round(EX / W, 3), round((EZ - CHIN) / W, 3)],
        'eye_opening_W': [round(float(np.ptp(rimL[:, 0]) / W), 3), round(float(np.ptp(rimL[:, 2]) / W), 3)],
        'nose_tip_z_W': round(NOSE_TIP_Z, 3), 'nose_tip_y_m': round(nose_tip_y, 4),
        'nose_proud_of_face_W': round(float(front_local(0, NZ_L + .12, head_local)[0] - NOSE_TIP_L), 3)}
MEAS.update(LOG)

# ============================================================== JOIN, CLEAN, NORMALS
objects = []; part_tri = {}
NAMES = {'head': '_head', 'eye.L': '_eye_L', 'eye.R': '_eye_R', 'lash.L': '_lash_L', 'lash.R': '_lash_R', 'ear.L': '_ear_L', 'ear.R': '_ear_R',
         'band': '_bandana', 'tabs': '_bandana_tabs', 'body': '_body', 'arm.L': '_arm_L', 'arm.R': '_arm_R', 'leg.L': '_leg_L', 'leg.R': '_leg_R', 'tail': '_tail'}
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
    piv = {'head': tuple(O), 'eye.L': eye_centers['L'], 'eye.R': eye_centers['R'], 'lash.L': eye_centers['L'], 'lash.R': eye_centers['R'],
           'ear.L': tuple(ear_info[1]['S']), 'ear.R': tuple(ear_info[-1]['S']), 'band': tuple(O),
           'tabs': tuple(KNOT_C) if KNOT_C is not None else (0, 0, 0),
           'arm.L': joint_arms['L']['shoulder'], 'arm.R': joint_arms['R']['shoulder'],
           'leg.L': joint_legs['L']['hip'], 'leg.R': joint_legs['R']['hip'], 'tail': TAIL_JOINTS[0]}.get(group, (0, 0, 0))
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
    ears_j[tag] = {'base': [float(v) for v in ei['S']], 'mid': [float(v) for v in ei['S'] + ei['w'] * .13 * W],
                   'tip': [float(v) for v in ei['T']]}
joints = {'units': 'metres', 'coordinate_system': 'Blender Z-up, front -Y; character left is +X', 'design': DESIGN,
          'root': [0, 0, 0], 'hips': HIPS, 'spine': [0, .004, .310], 'chest': [0, .008, .410], 'neck': [0, .012, .495],
          'head_base': [0, .030, CHIN + .02], 'head': [float(v) for v in O],
          'jaw_pivot': [0, float(HY - .16 * W), float(CHIN + .15 * W)],
          'mouth_corners': {'L': [float(MHW + .006 * W), float(front_hit(MHW, CHIN + MOUTH['zk'] * W)[0]), float(CHIN + MOUTH['zk'] * W)],
                            'R': [float(-MHW - .006 * W), float(front_hit(-MHW, CHIN + MOUTH['zk'] * W)[0]), float(CHIN + MOUTH['zk'] * W)]},
          'eyes': eye_centers, 'brows': {'L': [BROW_X, float(front_hit(BROW_X, BROW_Z)[0]), BROW_Z], 'R': [-BROW_X, float(front_hit(-BROW_X, BROW_Z)[0]), BROW_Z]},
          'lashes': lash_info, 'ears': ears_j, 'arms': joint_arms, 'legs': joint_legs, 'tail': TAIL_JOINTS,
          'notes': ['Phase 1: no rig, weights or animations.',
                    'Head skin = zero surface of a smooth implicit ball (fitted superquadric + lower-face fullness + nose button), radially projected, analytic normals.',
                    'Eyelid holes ringed by %d concentric loops each, rim rolled in behind separate lens eyeballs; 3 loops round the mouth, 4 round the nose.' % len(EYE_SCALES),
                    'Separate pieces: eyes, lash ribbons (origin at the eye centre, for the upper lids), ears, tail' +
                    (', bandana ring + knot (rigid head follower), bandana tabs (hanging cloth with bend rings, origin at the knot).' if HAS_BAND else
                     '; the overalls, straps and buttons are in the body (rigid on the spine / hips).')]}
if HAS_BAND: joints['bandana'] = {'front_z': BAND_ZF, 'back_z': BAND_ZB, 'knot': [float(v) for v in KNOT_C], 'tabs': TAB_INFO}
if not RIG:
    with open(os.path.join(ROOT, 'joints-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(joints, f, indent=2)
    with open(os.path.join(ROOT, 'measurements-model-%s.json' % DESIGN), 'w', encoding='utf-8') as f: json.dump(MEAS, f, indent=2, default=float)
print('MEAS', json.dumps(MEAS, default=float), flush=True)
bpy.context.scene.cursor.location = (0, 0, 0)
if RIG: raise_done = True
else:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, TAG + '.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_animations=False)
print('FOLKCAT_BUILD_DONE', json.dumps({'design': DESIGN, 'triangles': tri_count, 'model': MODEL}), flush=True)
