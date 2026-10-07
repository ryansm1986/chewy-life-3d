"""Shadow's whelp wing prop (one LEFT wing; the game mirrors x for the right one), deterministic.

    blender --background --factory-startup --python build_wing.py

Local frame (Blender): origin = the wing root (the shoulder attachment, the flap pivot), +X = span outward, -Y = forward,
+Z = up. At flap 0 the membrane lies level; the game flaps it by rotating about the forward axis at the origin.
Exported to public/models/shadow-whelp-wing.glb (glTF axes: +X span, +Z forward, +Y up).

Parts (thick felt, rounded everywhere, nothing card-thin):
- membrane: a closed felt pillow (top + bottom surfaces meeting in a rounded rim), 1.6 cm thick, sagging between the
  struts, with a scalloped trailing edge between the finger tips;
- arm (leading-edge bone), wrist knob, three finger struts (tubes that stand proud of both faces), a root knob, and a
  small brass thumb claw at the wrist.
"""
import bpy, bmesh, math, json, os, struct, zlib
import numpy as np

TASK = os.path.dirname(os.path.abspath(__file__))
MODEL = 'D:/projects/chewy-life-3d/public/models/shadow-whelp-wing.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
PI = math.pi

def rgb(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
def mix(a, b, t): t = np.asarray(t, np.float64)[..., None]; return np.asarray(a) * (1 - t) + np.asarray(b) * t
def sstep(a, b, x): t = np.clip((np.asarray(x, np.float64) - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def length(v): return np.sqrt((v * v).sum(-1))
def nrm(v): v = np.asarray(v, np.float64); return v / np.linalg.norm(v)
HEX = {'emerald': '#3A9A6A', 'em_light': '#55B585', 'em_shade': '#2F8A5C',
       'memb': '#F2C48A', 'memb_light': '#F8D6A6', 'memb_shade': '#E2AD72', 'memb_edge': '#E7B479', 'memb_under': '#E6B67E',
       'rib': '#DDA465', 'rib_light': '#EBB97C', 'rib_shade': '#C68D52', 'brass': '#C8A050', 'br_light': '#E6C77A', 'br_shade': '#A9843C'}
C_ = {k: rgb(v) for k, v in HEX.items()}

# ------------------------------------------------------------------ the plan (x out, y back), metres
# A bat wing: the arm runs from the root to the wrist W, the leading edge bends forward there, and the membrane fans out
# from the wrist: the leading finger to the tip, then three finger struts to the scallop points. The membrane grid is a
# fan from W, so every strut lies on a grid column. Round 2: the whole plan x1.25 (span ~0.42 m, like the sheet).
SC = 1.25
W = SC * np.array([0.150, -0.016])            # wrist (the arm sweeps out nearly straight: little reach forward of the root)
TIPS = [SC * np.array(t) for t in ([0.332, 0.020], [0.300, 0.112], [0.236, 0.172], [0.150, 0.194])]
R0, R1 = SC * np.array([0.000, -0.008]), SC * np.array([0.030, 0.075])
DROOP = {'T1': 0.0, 'T2': 0.024, 'T3': -0.040, 'T4': -0.085, 'R1': 0.0, 'R0': 0.0}   # a twist: the panels face different ways
def arc(a, b, depth, n):
    """points from a to b bowing toward the wrist by depth (the scallop between two finger tips)"""
    t = np.linspace(0, 1, n + 1)[1:]
    m = a + np.outer(t, b - a); toward = W - (a + b) / 2; toward /= np.linalg.norm(toward)
    return m + np.outer(depth * np.sin(PI * t), toward)
TRAIL = np.vstack([TIPS[0][None], arc(TIPS[0], TIPS[1], SC * 0.026, 20), arc(TIPS[1], TIPS[2], SC * 0.027, 20),
                   arc(TIPS[2], TIPS[3], SC * 0.027, 20), arc(TIPS[3], R1, SC * 0.030, 24), np.linspace(R1, R0, 10)[1:]])
OUTLINE = np.vstack([np.linspace(R0, W, 12)[:-1], np.linspace(W, TIPS[0], 14)[:-1], TRAIL[:-1]])
def seg_dist(P, A, B):
    ab = B - A; t = np.clip(((P - A) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return length(P - (A + t[..., None] * ab))
def poly_dist(P, poly, closed=True):
    best = np.full(P.shape[:-1], 1e9); n = len(poly)
    for k in range(n if closed else n - 1):
        best = np.minimum(best, seg_dist(P, poly[k], poly[(k + 1) % n]))
    return best
def angd(p): d = p - W; return math.degrees(math.atan2(d[1], d[0]))
KEYS = ('T1', 'T2', 'T3', 'T4', 'R1', 'R0')
KEYA = [angd(TIPS[0]), angd(TIPS[1]), angd(TIPS[2]), angd(TIPS[3]), angd(R1), angd(R0)]
assert all(b > a for a, b in zip(KEYA, KEYA[1:])), KEYA
COUNTS = [7, 6, 6, 9, 5]
COLA = np.concatenate([np.linspace(KEYA[k], KEYA[k + 1], COUNTS[k] + 1)[:-1] for k in range(5)] + [[KEYA[-1]]])
STRUT_A = [KEYA[0], KEYA[1], KEYA[2], KEYA[3], KEYA[5]]       # the leading finger, the three struts, and the arm (W -> root)
STRUT_COL = [int(np.argmin(np.abs(COLA - a))) for a in STRUT_A]
def ray_hit(alpha):
    d = np.array([math.cos(math.radians(alpha)), math.sin(math.radians(alpha))]); best = None
    for a, b in zip(TRAIL[:-1], TRAIL[1:]):
        e = b - a; M = np.array([[d[0], -e[0]], [d[1], -e[1]]])
        if abs(np.linalg.det(M)) < 1e-12: continue
        t, u = np.linalg.solve(M, a - W)
        if t > 1e-6 and -1e-9 <= u <= 1 + 1e-9 and (best is None or t < best): best = t
    assert best is not None, alpha
    return W + best * d
EDGE = np.array([ray_hit(a) for a in COLA]); EDGE[0] = TIPS[0]; EDGE[-1] = R0
for k, c in zip(range(4), STRUT_COL[:4]): EDGE[c] = TIPS[k]
NC = len(COLA)
s_rows = np.array([0.0, 0.16, 0.34, 0.53, 0.71, 0.85, 0.94, 0.985, 1.0])
NR = len(s_rows) - 1
P2 = W + s_rows[:, None, None] * (EDGE - W)[None]                                # (NR+1, NC, 2)
HALF, ROUND = 0.0090, 0.0115
d_edge = poly_dist(P2, OUTLINE); d_edge[-1] = 0; d_edge[:, 0] = 0; d_edge[:, -1] = 0; d_edge[0] = 0
hth = HALF * np.sqrt(np.clip(d_edge / ROUND * (2 - d_edge / ROUND), 0, 1)); hth = np.where(d_edge >= ROUND, HALF, hth)
SAG = 0.014
def sag_of(alpha, s):
    k = int(np.clip(np.searchsorted(STRUT_A, alpha) - 1, 0, len(STRUT_A) - 2))
    f = np.clip((alpha - STRUT_A[k]) / (STRUT_A[k + 1] - STRUT_A[k]), 0, 1)
    return SAG * math.sin(PI * f) ** 0.9 * float(sstep(0.0, 0.55, s))
Z0 = -np.array([[sag_of(a, s_) for a in COLA] for s_ in s_rows])
ZD = np.interp(COLA, KEYA, [DROOP[k] for k in KEYS])[None, :] * s_rows[:, None]   # a cone from the wrist
Z0 = Z0 + ZD
TOP = np.concatenate([P2, (Z0 + hth)[..., None]], -1); BOT = np.concatenate([P2, (Z0 - hth)[..., None]], -1)
def strut_dist(P): return np.min([seg_dist(P, W, e) for e in (TIPS[0], TIPS[1], TIPS[2], TIPS[3], R0)], axis=0)

# ------------------------------------------------------------------ tubes (arm, fingers), knobs, claw
def tube(path, radii, CT=8, flat=1.0):
    seg_ = length(np.diff(path, axis=0)); c = np.r_[0, np.cumsum(seg_)]; u = c / c[-1]
    T = np.gradient(path, axis=0); T /= length(T)[:, None]
    up = np.array([0, 0, 1.0]); N = up - (T @ up)[:, None] * T; N /= length(N)[:, None]; B = np.cross(T, N)
    r = np.interp(u, np.linspace(0, 1, len(radii)), radii)
    a = 2 * PI * np.arange(CT) / CT
    ring = path[:, None] + r[:, None, None] * (np.cos(a)[None, :, None] * N[:, None] * flat + np.sin(a)[None, :, None] * B[:, None])
    cap0 = (path[0] - T[0] * r[0] * 0.9)[None].repeat(CT, 0); cap1 = (path[-1] + T[-1] * r[-1] * 0.9)[None].repeat(CT, 0)
    mid0 = path[0][None] + 0.72 * (ring[0] - path[0]) - T[0] * r[0] * 0.62
    mid1 = path[-1][None] + 0.72 * (ring[-1] - path[-1]) + T[-1] * r[-1] * 0.62
    return np.concatenate([cap0[None], mid0[None], ring, mid1[None], cap1[None]], 0)
def line3(a, b, n): return np.c_[np.linspace(a, b, n), np.zeros(n)]
WR3 = np.r_[W, 0.0]
# round 2: the emerald arm and leading finger 1.5x chunkier; the three struts are tan felt ribs (as on the sheet)
TUBES = {'arm': tube(line3(np.zeros(2), W, 10), [0.0235, 0.0212, 0.0198], CT=10, flat=0.92)}
FINGER_R = ((0.0185, 0.0100), (0.0125, 0.0072), (0.0122, 0.0070), (0.0120, 0.0068))
for k, (r0, r1) in enumerate(FINGER_R):
    tip3 = np.r_[TIPS[k], DROOP['T%d' % (k + 1)]]
    TUBES['finger%d' % (k + 1)] = tube(np.linspace(np.r_[W, 0.0], tip3, 10), [r0, 0.75 * r0 + 0.25 * r1, r1], CT=10 if k == 0 else 8, flat=0.9)
def sphere(c, r, NA=10, NB=6, squash=1.0):
    th = np.linspace(0, PI, NB + 1); ph = 2 * PI * np.arange(NA) / NA
    T_, F_ = np.meshgrid(th, ph, indexing='ij')
    P = np.stack([np.sin(T_) * np.cos(F_), np.sin(T_) * np.sin(F_), np.cos(T_) * squash], -1) * r + c
    P[0] = P[0].mean(0); P[-1] = P[-1].mean(0); return P
KNOBS = {'root': sphere(np.zeros(3), 0.0300, 12, 7), 'wrist': sphere(WR3, 0.0255, 12, 7)}
def cone(base, up, H, r, NA=8, rows=(-0.2, 0.0, 0.3, 0.56, 0.76, 0.9, 0.97), prof=0.6, bend=None):
    up = nrm(up); bend = np.zeros(3) if bend is None else bend
    ref = np.array([0, 0, 1.0]) if abs(up[2]) < 0.9 else np.array([1.0, 0, 0])
    e1 = nrm(np.cross(up, ref)); e2 = np.cross(up, e1); a = 2 * PI * np.arange(NA) / NA
    P = [np.repeat((base + H * (rows[0] - 0.03) * up)[None], NA, 0)]
    for h in rows:
        hh = max(h, 0.0); rr = r * (1 - hh) ** prof * (1 + 0.1 * math.sin(PI * hh))
        c = base + H * h * up + H * hh * hh * bend
        P.append(c + rr * (np.cos(a)[:, None] * e1 + np.sin(a)[:, None] * e2))
    P.append(np.repeat((base + H * up + H * bend)[None], NA, 0))
    return np.array(P)
CLAW = cone(WR3 + np.array([0.006, -0.018, 0.006]), nrm([0.25, -0.85, 0.45]), H=0.032, r=0.0115, bend=np.array([0, 0, -0.25]))

# ------------------------------------------------------------------ atlas 512: membrane | emerald tubes | brass
AW = AH = 512
CH = {'memb': (0, 0, 512, 320), 'tube': (0, 320, 256, 128), 'rib': (0, 448, 256, 64), 'knob': (256, 320, 128, 192), 'brass': (384, 320, 128, 192)}
G = 3
def auv(ch, u, v):
    x, y, w, h = CH[ch]; return ((x + G + u * (w - 2 * G)) / AW, (y + G + v * (h - 2 * G)) / AH)
def grid_lookup(Gd, U, V):
    Gd = np.concatenate([Gd, Gd[:, :1]], 1); R = Gd.shape[0] - 1; C = Gd.shape[1] - 1
    fi = np.clip(U * C, 0, C - 1e-6); fj = np.clip(V * R, 0, R - 1e-6); i0 = fi.astype(int); j0 = fj.astype(int)
    ti = (fi - i0)[..., None]; tj = (fj - j0)[..., None]
    a = Gd[j0, i0] * (1 - ti) + Gd[j0, i0 + 1] * ti; b = Gd[j0 + 1, i0] * (1 - ti) + Gd[j0 + 1, i0 + 1] * ti
    return a * (1 - tj) + b * tj
def speckle(p, amp=0.02, cell=0.0015):
    q = np.floor(p / cell); h = np.sin(q[..., 0] * 12.9898 + q[..., 1] * 78.233 + q[..., 2] * 37.719) * 43758.5453
    return 1 + amp * (2 * (h - np.floor(h)) - 1)
img = np.zeros((AH, AW, 3)); img[:] = C_['memb']
def put(ch, C): x, y, w, h = CH[ch]; img[y:y + h, x:x + w] = C
x, y, w, h = CH['memb']
U, V = np.meshgrid(np.clip((np.arange(w) + .5 - G) / (w - 2 * G), 0, 1), np.clip((np.arange(h) + .5 - G) / (h - 2 * G), 0, 1))
def fan_lookup(Gd, Uf, Vf):
    """bilinear lookup in a non-wrapping (NR+1, NC) grid; Uf, Vf in 0..1"""
    R = Gd.shape[0] - 1; C = Gd.shape[1] - 1
    fi = np.clip(Uf * C, 0, C - 1e-6); fj = np.clip(Vf * R, 0, R - 1e-6); i0 = fi.astype(int); j0 = fj.astype(int)
    ti = (fi - i0)[..., None]; tj = (fj - j0)[..., None]
    a = Gd[j0, i0] * (1 - ti) + Gd[j0, i0 + 1] * ti; b = Gd[j0 + 1, i0] * (1 - ti) + Gd[j0 + 1, i0 + 1] * ti
    return a * (1 - tj) + b * tj
under = U >= 0.5                                                                # left half: top face, right half: underside
Uf = np.where(under, (U - 0.5) * 2, U * 2)
Pm = np.where(under[..., None], fan_lookup(BOT, Uf, V), fan_lookup(TOP, Uf, V))
dS = strut_dist(Pm[..., :2]); dE = poly_dist(Pm[..., :2], OUTLINE)
Cm = mix(C_['memb_light'], C_['memb'], 0.30 + 0.70 * sstep(0.01, 0.08, dS))   # peach-tan felt, lighter mid-panel
Cm = mix(Cm, C_['memb_shade'], 0.75 * (1 - sstep(0.005, 0.030, dS)))            # soft shade where the felt meets a strut
Cm = mix(Cm, C_['memb_edge'], 0.55 * (1 - sstep(0.0, 0.016, dE)))               # the rolled rim
Cm = mix(Cm, C_['memb_under'], 0.35 * under)                                    # the underside a touch deeper
put('memb', Cm * speckle(Pm)[..., None])
x, y, w, h = CH['tube']
ua = np.ones((h, 1)) * np.clip((np.arange(w) + .5 - G) / (w - 2 * G), 0, 1)[None, :]
nz = np.cos(2 * PI * ua)                                                         # tube columns go round: u = 0 is the top
Ct = mix(C_['emerald'], C_['em_light'], 0.5 * sstep(0.2, 0.95, nz)); Ct = mix(Ct, C_['em_shade'], 0.6 * sstep(0.0, 0.9, -nz))
ps = np.stack(list(np.meshgrid(np.arange(w) * 0.002, np.arange(h) * 0.002)) + [np.zeros((h, w))], -1)
put('tube', Ct * speckle(ps)[..., None])
x, y, w, h = CH['rib']                                                         # fingers 2-3: tan felt ribs (as on the sheet)
ua = np.ones((h, 1)) * np.clip((np.arange(w) + .5 - G) / (w - 2 * G), 0, 1)[None, :]; nz = np.cos(2 * PI * ua)
Cr = mix(C_['rib'], C_['rib_light'], 0.5 * sstep(0.2, 0.95, nz)); Cr = mix(Cr, C_['rib_shade'], 0.5 * sstep(0.0, 0.9, -nz))
ps = np.stack(list(np.meshgrid(np.arange(w) * 0.002, np.arange(h) * 0.002)) + [np.zeros((h, w))], -1)
put('rib', Cr * speckle(ps)[..., None])
x, y, w, h = CH['knob']
vk = np.clip((np.arange(h) + .5 - G) / (h - 2 * G), 0, 1)[:, None] * np.ones((1, w))
nzk = np.cos(PI * vk)
Ck = mix(C_['emerald'], C_['em_light'], 0.5 * sstep(0.2, 0.95, nzk)); Ck = mix(Ck, C_['em_shade'], 0.6 * sstep(0.0, 0.9, -nzk))
ps = np.stack(list(np.meshgrid(np.arange(w) * 0.002, np.arange(h) * 0.002)) + [np.zeros((h, w))], -1)
put('knob', Ck * speckle(ps)[..., None])
x, y, w, h = CH['brass']
vb = np.clip((np.arange(h) + .5 - G) / (h - 2 * G), 0, 1)[:, None] * np.ones((1, w))
Cb = mix(C_['br_shade'], C_['brass'], sstep(0.0, 0.45, vb)); Cb = mix(Cb, C_['br_light'], 0.55 * sstep(0.55, 1.0, vb))
ps = np.stack(list(np.meshgrid(np.arange(w) * 0.002, np.arange(h) * 0.002)) + [np.zeros((h, w))], -1)
put('brass', Cb * speckle(ps)[..., None])
u8 = np.round(np.clip(img, 0, 1) * 255).astype(np.uint8)
def png_chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
apath = os.path.join(TASK, 'shadow-whelp-wing_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in u8[::-1])
with open(apath, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', AW, AH, 8, 2, 0, 0, 0)) +
            png_chunk(b'IDAT', zlib.compress(raw, 9)) + png_chunk(b'IEND', b''))
im = bpy.data.images.load(apath); im.name = 'Shadow_whelp_wing_atlas'; im.pack()
mat = bpy.data.materials.new('Shadow_whelp_wing'); mat.use_nodes = True
bs = mat.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = 0.8; bs.inputs['Metallic'].default_value = 0.0
bs.inputs['Specular IOR Level'].default_value = 0.3
tx = mat.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = im; mat.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])

# ------------------------------------------------------------------ meshes
def grid_mesh(name, P, chart, outward_fn, vrange=(0.0, 1.0)):
    R1, C = P.shape[0], P.shape[1]; verts, vid = [], {}
    def V(j, i):
        i %= C; key = (j, 0) if j in (0, R1 - 1) else (j, i)
        if key not in vid: vid[key] = len(verts); verts.append(tuple(P[key[0], key[1]]))
        return vid[key]
    faces, uvs = [], []
    Rn = R1 - 1
    for j in range(Rn):
        for i in range(C):
            u0, u1, v0, v1 = i / C, (i + 1) / C, j / Rn, (j + 1) / Rn
            if j == 0: faces.append((V(0, 0), V(1, i), V(1, i + 1))); uvs.append((((u0 + u1) / 2, v0), (u0, v1), (u1, v1)))
            elif j == Rn - 1: faces.append((V(j, i), V(j + 1, 0), V(j, i + 1))); uvs.append(((u0, v0), ((u0 + u1) / 2, v1), (u1, v0)))
            else: faces.append((V(j, i), V(j + 1, i), V(j + 1, i + 1), V(j, i + 1))); uvs.append(((u0, v0), (u0, v1), (u1, v1), (u1, v0)))
    Vt = np.array(verts); sg = 0.0
    for f in faces:
        a, b, c = Vt[f[0]], Vt[f[1]], Vt[f[2]]; cc = (a + b + c) / 3
        sg += np.sign(np.dot(np.cross(b - a, c - a), outward_fn(cc)))
    if sg < 0: faces = [f[::-1] for f in faces]; uvs = [u[::-1] for u in uvs]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    uvl = me.uv_layers.new(name='UVMap')
    for poly, pts in zip(me.polygons, uvs):
        for li, pt in zip(poly.loop_indices, pts): uvl.data[li].uv = auv(chart, pt[0], vrange[0] + (vrange[1] - vrange[0]) * pt[1])
    for poly in me.polygons: poly.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(mat)
    return ob
def axis_out(path):
    def f(c):
        d = length(path - c); k = int(np.argmin(d)); return c - path[k]
    return f
def fan_pillow(name):
    verts, vid = [], {}
    def V(side, j, c):
        shared = j == 0 or j == NR or c == 0 or c == NC - 1
        key = ('s', j, c) if shared else (side, j, c)
        if j == 0: key = ('s', 0, 0)
        if key not in vid: vid[key] = len(verts); verts.append(tuple((TOP if side == 't' else BOT)[j, c]))
        return vid[key]
    faces, uvs = [], []
    for side in 't', 'b':
        u_off = 0.0 if side == 't' else 0.5
        for j in range(NR):
            for c in range(NC - 1):
                u0, u1 = u_off + 0.5 * c / (NC - 1), u_off + 0.5 * (c + 1) / (NC - 1); v0, v1 = j / NR, (j + 1) / NR
                if j == 0: f = (V(side, 0, 0), V(side, 1, c + 1), V(side, 1, c)); uv = (((u0 + u1) / 2, v0), (u1, v1), (u0, v1))
                else: f = (V(side, j, c), V(side, j, c + 1), V(side, j + 1, c + 1), V(side, j + 1, c)); uv = ((u0, v0), (u1, v0), (u1, v1), (u0, v1))
                Vt = [np.array(verts[i]) for i in f]; nz = np.cross(Vt[1] - Vt[0], Vt[2] - Vt[0])[2]
                if (nz < 0) == (side == 't'): f = f[::-1]; uv = uv[::-1]
                faces.append(f); uvs.append(uv)
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    uvl = me.uv_layers.new(name='UVMap')
    for poly, pts in zip(me.polygons, uvs):
        for li, pt in zip(poly.loop_indices, pts): uvl.data[li].uv = auv('memb', *pt)
    for poly in me.polygons: poly.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(mat)
    return ob
obs = [fan_pillow('wing_membrane')]
TUBE_NAMES = list(TUBES)
for k, (nm, P) in enumerate(TUBES.items()):                     # each tube its own v strip of the tube chart (the paint only varies along u)
    axis = P[2:-2].mean(1)
    ch_ = 'rib' if nm in ('finger2', 'finger3', 'finger4') else 'tube'   # the arm and the leading finger are emerald
    obs.append(grid_mesh('wing_' + nm, P, ch_, axis_out(axis), vrange=(k / len(TUBES), (k + 1) / len(TUBES))))
for nm, P in KNOBS.items():
    c = P.reshape(-1, 3).mean(0); obs.append(grid_mesh('wing_knob_' + nm, P, 'knob', lambda q, c=c: q - c))
obs.append(grid_mesh('wing_claw', CLAW, 'brass', axis_out(CLAW[1:-1].mean(1))))
bpy.ops.object.select_all(action='DESELECT')
for o in obs: o.select_set(True)
bpy.context.view_layer.objects.active = obs[0]; bpy.ops.object.join()
wing = bpy.context.object; wing.name = 'Whelp_wing'; wing.data.name = 'Whelp_wing'
bm = bmesh.new(); bm.from_mesh(wing.data)
bad = [f for f in bm.faces if f.calc_area() < 1e-12]
if bad: bmesh.ops.delete(bm, geom=bad, context='FACES')
bm.to_mesh(wing.data); bm.free()
for v in wing.data.vertices: assert all(math.isfinite(c) for c in v.co)
wing['pivot'] = 'origin = wing root (flap pivot)'; wing['axes'] = '+X span out, -Y forward, +Z up (Blender)'
wing.data.calc_loop_triangles(); tris = len(wing.data.loop_triangles)
V_ = np.array([tuple(v.co) for v in wing.data.vertices])
info = {'triangles': tris, 'bounds_min': V_.min(0).round(4).tolist(), 'bounds_max': V_.max(0).round(4).tolist(),
        'span_m': float(V_[:, 0].max()), 'chord_m': float(V_[:, 1].max() - V_[:, 1].min()),
        'thickness_m': {'membrane': 2 * HALF, 'arm_d_root': 0.047, 'leading_finger_d_root': 0.037, 'strut_d_root': 0.025, 'sag': SAG}}
# visibility: silhouette area per camera and flap (left wing at its mount, body frame), vs. the top view at flap 0
tri_idx = np.array([[wing.data.loops[i].vertex_index for i in t.loops] for t in wing.data.loop_triangles])
def sil_area(P, view, cell=0.0015):
    v = nrm(view); e1 = nrm(np.cross(v, [0, 0, 1.0]) if abs(v[2]) < 0.99 else np.cross(v, [0, 1.0, 0])); e2 = np.cross(v, e1)
    Q = np.stack([P @ e1, P @ e2], -1); lo = Q.min(0) - cell; hi = Q.max(0) + cell
    nx, ny = (np.ceil((hi - lo) / cell)).astype(int) + 1; grid = np.zeros((nx, ny), bool)
    for t in tri_idx:
        a, b, c = Q[t]; mn = np.floor((np.minimum(np.minimum(a, b), c) - lo) / cell).astype(int); mx = np.ceil((np.maximum(np.maximum(a, b), c) - lo) / cell).astype(int)
        xs = lo[0] + cell * np.arange(mn[0], mx[0] + 1); ys = lo[1] + cell * np.arange(mn[1], mx[1] + 1)
        X, Y = np.meshgrid(xs, ys, indexing='ij'); d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-14: continue
        l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / d; l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / d
        m = (l1 >= 0) & (l2 >= 0) & (l1 + l2 <= 1); grid[mn[0]:mx[0] + 1, mn[1]:mx[1] + 1] |= m
    return grid.sum() * cell * cell
def flapR(deg):
    t = math.radians(deg); c, s_ = math.cos(t), math.sin(t); return np.array([[c, 0, -s_], [0, 1, 0], [s_, 0, c]])
cams = {}
for yaw in (45, -45, 135, -135):
    e = math.radians(45); y = math.radians(yaw); cams['game%+d' % yaw] = np.array([math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)])
cams['front'] = np.array([0, -1.0, 0.1]); cams['side'] = np.array([1.0, 0, 0.1])
ref = sil_area(V_, np.array([0, 0, 1.0]))
vis = {'reference_top_view_m2': round(ref, 5), 'fraction_of_top_view': {}}
for flap in (-30, 0, 30, 60):                                   # the game's flap range: -30 .. +60
    Pf = V_ @ flapR(flap).T
    vis['fraction_of_top_view']['flap%+d' % flap] = {k: round(sil_area(Pf, v) / ref, 3) for k, v in cams.items()}
allg = [v for f in vis['fraction_of_top_view'].values() for k, v in f.items() if k.startswith('game')]
vis['worst_game_fraction'] = min(allg); vis['note'] = 'left wing; the mirrored right wing sees the mirrored yaws'
info['visibility'] = vis
print('WING_VIS worst game fraction', vis['worst_game_fraction'], flush=True)
json.dump(info, open(os.path.join(TASK, 'wing_measure.json'), 'w'), indent=1)
print('WING', json.dumps(info), flush=True)
wref = {'charts': CH, 'atlas': [AW, AH], 'tube_order': TUBE_NAMES, 'tube_axes': {k: P[2:-2].mean(1).tolist() for k, P in TUBES.items()},
        'tube_radii': {k: length(P[2:-2] - P[2:-2].mean(1, keepdims=True)).mean(1).tolist() for k, P in TUBES.items()},
        'knobs': {k: P.reshape(-1, 3).mean(0).tolist() for k, P in KNOBS.items()}, 'claw_axis': [CLAW[1].mean(0).tolist(), CLAW[-1][0].tolist()]}
json.dump(wref, open(os.path.join(TASK, 'wing_ref.json'), 'w', encoding='utf-8'))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK, 'shadow-whelp-wing.blend'))
bpy.ops.export_scene.gltf(filepath=MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                          export_animations=False)
print('WING_DONE', MODEL, flush=True)
