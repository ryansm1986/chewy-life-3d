"""Shadow's dragon whelp outfit (shadow-whelp): a re-dress of the approved Toybox Shadow, deterministic.

    blender --background --factory-startup --python build_shadow-whelp.py

1. Runs the archived Shadow build (base/build_shadow-toy.py, MD5-checked against the archive) unchanged, up to its
   joints marker: his seven objects and his 2048 atlas exactly as approved. Nothing of his is moved or deleted.
2. Adds the costume as separate objects on top (thick felt shells, never cards):
   - Whelp_hood: an emerald hood offset from his skull and nape (a star grid from a crown pole, cut by the face
     opening and the collar line, with a rolled hem that tucks under his skin), ear slits (a painted opening plus a
     felt piping ring around each ear), two brass horns and three brass back spikes;
   - Whelp_coat: an emerald back coat from the collar to the rump with a lobed hem, three brass spine spikes, painted
     brass felt stars, and the cream belly-scale bib;
   - Whelp_tail: a spiky tail cover over his stub tail (a tapered tube), four brass spikes and a tip spike.
3. The costume's texture goes into new rows on top of his atlas (2048 x 2304): his 2048 x 2048 rows are byte-identical
   at the same pixel positions, and his UVs are rescaled in v so they sample the same pixels. One image, one material.
4. Saves shadow-whelp.blend, lock-parts.npz (his objects, for lock_check.py), wing_mount.json and measure.json, and
   exports public/models/shadow-whelp.glb. The wing prop is build_wing.py.
Units: metres, Blender Z-up, front -Y, character left +X, ground z = 0.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib, hashlib
import numpy as np
from mathutils import Vector

TASK = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(TASK, 'base', 'build_shadow-toy.py')
ARCHIVE = 'D:/projects/chewy-life-3d/tools/blender/codex/assets/shadow-toy/build_shadow-toy.py'
MODEL = 'D:/projects/chewy-life-3d/public/models/shadow-whelp.glb'
MARK = '# ------------------------------------------------------------------ joints'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

# ================================================================== 1. the approved Shadow, unchanged
# Rig mode: rig_shadow-whelp.py runs sections 1-4 of this file inside the scene of the archived rig_shadow-toy.py, which has
# already run the same base build: it passes that namespace (WHELP_NS), its atlas (WHELP_BASE_ATLAS: the 2048 atlas with the
# rig's lid, mouth and tongue patches) and every rig mesh (WHELP_UV_OBJECTS), whose UVs then get the same v rescale.
RIG_MODE = globals().get('WHELP_MODE') == 'rig'
raw_src = open(BASE, 'rb').read()
BASE_MD5 = hashlib.md5(raw_src).hexdigest()
ARCHIVE_MD5 = hashlib.md5(open(ARCHIVE, 'rb').read()).hexdigest()
assert BASE_MD5 == ARCHIVE_MD5, 'base/build_shadow-toy.py differs from the archive'
src = raw_src.decode('utf-8')
if RIG_MODE:
    ns = WHELP_NS
else:
    ns = {'__file__': BASE, '__name__': 'shadow_base'}
    exec(compile(src[:src.index(MARK)], BASE, 'exec'), ns)
print('BASE_DONE', BASE_MD5, flush=True)

sstep, smin, smax, sd_se, nrm, length, dot = ns['sstep'], ns['smin'], ns['smax'], ns['sd_se'], ns['nrm'], ns['length'], ns['dot']
clamp01, rgb, mix, rot, spow = ns['clamp01'], ns['rgb'], ns['mix'], ns['rot'], ns['spow']
head_full, body_sdf, tail_sdf = ns['head_full'], ns['body_sdf'], ns['tail_sdf']
sdf_normals, grid_lookup = ns['sdf_normals'], ns['grid_lookup']
mat, G = ns['mat'], ns['G']
SHADOW = {o.name: o for o in (WHELP_UV_OBJECTS if RIG_MODE else ns['objects'])}
PI = math.pi
RS = np.random.RandomState(1234)

# ------------------------------------------------------------------ costume palette (brief hex values + painted shades)
WHEX = {
    'emerald': '#3A9A6A', 'em_light': '#55B585', 'em_shade': '#2F8A5C', 'em_stitch': '#2E8257',
    'brass': '#C8A050', 'br_light': '#E6C77A', 'br_shade': '#A9843C',
    'cream': '#F4E8D0', 'cr_light': '#FBF3E2', 'cr_shade': '#E0C99E', 'cr_line': '#C4A56E',
    'slit': '#2C7D53', 'slit_deep': '#27704B',
}
def wc(k): return rgb(WHEX[k])

# ================================================================== helpers
OUTER = [False]
def ray_exit(f, O, D, extra=None, tmax=0.36, K=90, iters=26, allow_miss=False):
    """First exit (innermost root, marching outward from O) of f(p) - extra along O + t D.
    allow_miss: rays without an exit return NaN instead of failing."""
    shp = D.shape[:-1]; D = D.reshape(-1, 3); N = len(D); O = np.asarray(O, np.float64)
    ex = np.zeros(N) if extra is None else np.broadcast_to(np.asarray(extra, np.float64), shp).reshape(-1)
    ts = np.linspace(0, tmax, K)
    lo = np.zeros(N); hi = np.full(N, tmax); found = np.zeros(N, bool)
    assert (f(O[None]) < 0).all(), 'ray_exit: origin outside'
    if OUTER[0]:                                                 # outermost root: scan inward from tmax
        assert ((f(O + D * tmax) - ex) > 0).all(), 'ray_exit: tmax inside'
        for k in range(K - 2, -1, -1):
            v = f(O + D * ts[k]) - ex; newly = (~found) & (v < 0)
            lo[newly] = ts[k]; hi[newly] = ts[k + 1]; found |= newly
            if found.all(): break
    else:
      for k in range(1, K):
        v = f(O + D * ts[k]) - ex; newly = (~found) & (v > 0)
        lo[newly] = ts[k - 1]; hi[newly] = ts[k]; found |= newly
        if found.all(): break
    if not allow_miss: assert found.all(), 'ray_exit: ray without exit'
    for _ in range(iters):
        m = .5 * (lo + hi); out = (f(O + D * m[:, None]) - ex) > 0
        hi = np.where(out, m, hi); lo = np.where(out, lo, m)
    P = O + D * (.5 * (lo + hi))[:, None]
    P[~found] = np.nan
    return P.reshape(shp + (3,))

def pole_frame(A, ref):
    A = nrm(A); R = nrm(np.asarray(ref, np.float64) - np.dot(ref, A) * A); B = np.cross(A, R)
    return A, R, B
def dirs(frame, TH, PH):
    A, R, B = frame
    return (np.cos(TH)[..., None] * A + np.sin(TH)[..., None] * (np.cos(PH)[..., None] * R + np.sin(PH)[..., None] * B))

def find_boundary(f_level, cut, O, frame, phi, th0=2.0, th1=176.0, step=1.0):
    """Per azimuth, the polar angle where the region (cut > 0 on the level surface) ends, marching from the pole.
    A ray with no exit (it runs into the body) counts as outside the region."""
    C = len(phi); thb = np.full(C, np.nan)
    def inside(th, cols):
        P = ray_exit(f_level, O, dirs(frame, th, phi[cols]), allow_miss=True)
        ok = ~np.isnan(P[:, 0]); r = np.zeros(len(cols), bool); r[ok] = cut(P[ok]) > 0
        return r
    for th in np.radians(np.arange(th0, th1, step)):
        cols = np.where(np.isnan(thb))[0]
        if not len(cols): break
        out = ~inside(np.full(len(cols), th), cols)
        thb[cols[out]] = th
    assert not np.isnan(thb).any(), 'find_boundary: region does not close'
    lo = thb - math.radians(step); hi = thb.copy(); allc = np.arange(C)
    for _ in range(22):
        m = .5 * (lo + hi); ins = inside(m, allc)
        lo = np.where(ins, m, lo); hi = np.where(ins, hi, m)
    return lo

def boundary_columns(f_level, cut, O, frame, C, fine=192, **kw):
    """Boundary on a fine azimuth grid, then C columns spaced evenly by 3D arc length along the boundary loop."""
    phf = 2 * PI * np.arange(fine) / fine
    thf = circ_smooth(find_boundary(f_level, cut, O, frame, phf, **kw), 1)
    E = ray_exit(f_level, O, dirs(frame, thf, phf))
    seg = length(np.roll(E, -1, 0) - E); cum = np.concatenate([[0], np.cumsum(seg)])
    # half arc length, half uniform angle: dense where the edge turns, never starved elsewhere
    w = 0.5 * cum / cum[-1] + 0.5 * np.arange(fine + 1) / fine
    tgt = np.arange(C) / C
    ph = np.interp(tgt, w, np.r_[phf, 2 * PI])
    th = np.interp(ph, np.r_[phf, 2 * PI], np.r_[thf, thf[0]])
    return ph, th

def circ_smooth(a, passes=2):
    for _ in range(passes): a = .25 * np.roll(a, 1, 0) + .5 * a + .25 * np.roll(a, -1, 0)
    return a

def grid_normals(P, O, pole0=True, wrap_v=False):
    """Vertex normals of a (R+1, C) grid (columns wrap), oriented away from O on the whole."""
    du = np.roll(P, -1, 1) - np.roll(P, 1, 1)
    if wrap_v: dv = np.roll(P, -1, 0) - np.roll(P, 1, 0)
    else:
        dv = np.zeros_like(P); dv[1:-1] = P[2:] - P[:-2]; dv[0] = P[1] - P[0]; dv[-1] = P[-1] - P[-2]
    n = np.cross(du, dv); L = length(n)[..., None]
    n = n / np.maximum(L, 1e-12)
    if pole0:
        n[0] = nrm(n[1].sum(0))
    s = np.sign(np.nansum(dot(n, P - O)))
    return n * s

def disk_rim(P_edge, S_edge, n_edge, tau, rows=3, tuck=0.0055, tuck_n=None):
    """Quarter-round hem from the shell edge (P_edge, at the offset) down into the skin, then a tuck row below it."""
    rr = np.maximum(dot(P_edge - S_edge, n_edge), 1e-4)[..., None]
    out = []
    for k in range(1, rows + 1):
        a = (PI / 2) * k / rows
        out.append(P_edge + rr * (math.cos(a) - 1) * n_edge + rr * math.sin(a) * tau)
    tn = tuck if tuck_n is None else tuck_n[..., None]
    out.append(P_edge - rr * n_edge + rr * tau - tn * n_edge)
    return np.stack(out, 0)

# ------------------------------------------------------------------ atlas (extended): costume rows above his 2048 rows
AW, AH = 2048, 2304
CH = {
    'hood': (0, 2048, 1024, 256), 'coat': (1024, 2048, 512, 256),
    'tail': (1536, 2048, 256, 128), 'bib': (1536, 2176, 256, 128),
    'brass': (1792, 2048, 128, 128), 'cuff': (1792, 2176, 128, 128),
}
def auv(chart, u, v):
    x, y, w, h = CH[chart]
    return ((x + G + u * (w - 2 * G)) / AW, (y + G + v * (h - 2 * G)) / AH)

PARTS = []   # dict(name, P, kind, chart, obj, N, paint, O)
def grid_mesh(name, P, kind, chart, O, pole0=False, poleR=False, wrap_v=False, urange=(0.0, 1.0)):
    """Mesh from a grid P (R+1 rows, C columns; columns wrap). kind: 'disk' (pole at row 0, open last row),
    'capsule' (poles at both ends), 'torus' (rows wrap too). Winding chosen so faces face away from O."""
    R1, C = P.shape[0], P.shape[1]
    verts, vid = [], {}
    def V(j, i):
        i %= C
        if wrap_v: j %= R1
        key = (j, 0) if ((j == 0 and pole0) or (j == R1 - 1 and poleR)) else (j, i)
        if key not in vid: vid[key] = len(verts); verts.append(tuple(P[key[0], key[1]]))
        return vid[key]
    faces, uvs = [], []
    Rn = R1 if wrap_v else R1 - 1
    for j in range(Rn):
        for i in range(C):
            u0, u1 = i / C, (i + 1) / C; v0, v1 = j / Rn, (j + 1) / Rn
            if j == 0 and pole0:
                faces.append((V(0, 0), V(1, i), V(1, i + 1))); uvs.append((((u0 + u1) / 2, v0), (u0, v1), (u1, v1)))
            elif j == Rn - 1 and poleR:
                faces.append((V(j, i), V(j + 1, 0), V(j, i + 1))); uvs.append(((u0, v0), ((u0 + u1) / 2, v1), (u1, v0)))
            else:
                faces.append((V(j, i), V(j + 1, i), V(j + 1, i + 1), V(j, i + 1))); uvs.append(((u0, v0), (u0, v1), (u1, v1), (u1, v0)))
    # orientation: majority of face normals away from O
    Vt = np.array(verts); sgn = 0.0
    for f in faces:
        a, b, c = Vt[f[0]], Vt[f[1]], Vt[f[2]]
        sgn += np.dot(np.cross(b - a, c - a), (a + b + c) / 3 - O)
    if sgn < 0: faces = [f[::-1] for f in faces]; uvs = [u[::-1] for u in uvs]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    uvl = me.uv_layers.new(name='Atlas')
    for poly, pts in zip(me.polygons, uvs):
        for li, pt in zip(poly.loop_indices, pts): uvl.data[li].uv = auv(chart, urange[0] + (urange[1] - urange[0]) * pt[0], pt[1])
    for poly in me.polygons: poly.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(mat)
    return ob

def tube_frame(T, up_hint):
    T = T / np.maximum(length(T)[..., None], 1e-12)
    N = up_hint - dot(up_hint, T)[..., None] * T; N = N / np.maximum(length(N)[..., None], 1e-12)
    return T, N, np.cross(T, N)

# ================================================================== 2a. HOOD
HOOD_O = np.array([0.0, -0.035, 0.445])
HOOD_F = pole_frame([0, 0.45, 0.89], [0, 0.89, -0.45])     # phi = 0: down the back to the nape (the seam, under the spikes)
def HF(p): return smin(head_full(p), body_sdf(p), 0.030)
def hood_off(p):
    y, z = p[..., 1], p[..., 2]
    return 0.0115 + 0.0040 * sstep(-0.03, 0.10, y) * sstep(0.36, 0.52, z)
def hood_level(p): return HF(p) - hood_off(p)
def Yf(z): return np.interp(z, [0.20, 0.33, 0.42, 0.50, 0.555, 0.60, 0.70], [-0.020, -0.036, -0.062, -0.100, -0.142, -0.180, -0.260])
def Zcoll(y): return 0.303 + 0.14945 * (y + 0.030)            # collar mid plane (front lower, 8.5 deg)
def hood_cut(p):
    gf = p[..., 1] - Yf(p[..., 2])
    gn = p[..., 2] - (Zcoll(p[..., 1]) + 0.0177 - 0.0050)      # overlaps the collar's top edge by 5 mm
    return smin(gf, gn, 0.015)

C_H, NJ_H = 56, 15
phi_h, thb_h = boundary_columns(hood_level, hood_cut, HOOD_O, HOOD_F, C_H)
s_rows = np.interp(np.arange(NJ_H + 1) / NJ_H, [0, .45, .80, 1], [0, .50, .84, 1])
TH = s_rows[:, None] * thb_h[None, :]
DH = dirs(HOOD_F, TH, np.broadcast_to(phi_h, TH.shape))
bead = 0.0025 * sstep(0.80, 1.0, s_rows)[:, None] * np.ones((1, C_H))
HOOD_SHELL = ray_exit(hood_level, HOOD_O, DH, extra=bead)
HOOD_SHELL[0] = HOOD_SHELL[0].mean(0)
# the hem: skin under the edge, the edge normal and the outward tangent (along increasing polar angle)
D_edge = DH[-1]
S_edge = ray_exit(HF, HOOD_O, D_edge)
n_edge = sdf_normals(HF, S_edge)
P_a = ray_exit(hood_level, HOOD_O, dirs(HOOD_F, thb_h + 0.02, phi_h)); P_b = ray_exit(hood_level, HOOD_O, dirs(HOOD_F, thb_h - 0.02, phi_h))
tau = P_a - P_b; tau -= dot(tau, n_edge)[:, None] * n_edge; tau /= length(tau)[:, None]
# nape part of the hem rests on the collar: its tuck stays shallow (it ends inside the collar band)
face = sstep(0.004, -0.004, HOOD_SHELL[-1][:, 1] - Yf(HOOD_SHELL[-1][:, 2]) - 0.02)   # 1 on the face edge, 0 at the nape
HOOD_RIM = disk_rim(HOOD_SHELL[-1], S_edge, n_edge, tau, rows=3, tuck_n=0.0055 * face + 0.0015 * (1 - face))
HOOD_P = np.concatenate([HOOD_SHELL, HOOD_RIM], 0)
HOOD_N = grid_normals(HOOD_P, HOOD_O)
HOOD_EDGE_ROW = NJ_H
print('HOOD rows', HOOD_P.shape, 'theta_b deg', np.degrees(thb_h).min().round(1), np.degrees(thb_h).max().round(1), flush=True)

# ---------------- ear slits: where each ear crosses the hood shell, a painted opening and a felt piping ring
EAR = ns['EAR']
SLIT = {}
EAR_BONE = {'L': np.array([0.1214, 0.03, 0.5624]), 'R': np.array([-0.1214, 0.03, 0.5624])}
EAR_SWING = (-0.6, -0.3, 0.0, 0.3, 0.6)                    # the realistic ear-spring range (|a| <= 0.6 with overshoot)
def ear_pose(tag, s, a):
    P = EAR[tag][0]; base, up, fwd, side, L = ns['ear_frame'](s); hroot = ns['EAR_IN'] * L
    h = dot(P - base, up); e = sstep(hroot - 0.010, hroot + 0.025, h)
    R = rot([1, 0, 0], 0.4 * a) @ rot([0, -1, 0], s * 0.2 * a)          # three.js XYZ euler: Rx Ry Rz
    piv = EAR_BONE[tag]
    return (1 - e)[..., None] * P + e[..., None] * ((P - piv) @ R.T + piv)
CUFF_R, CUFF_CLEAR = 0.0065, 0.0025
CUFF_GAP = CUFF_CLEAR                                            # (recorded in measure.json)
def hull2(P):
    """convex hull (monotone chain), counter-clockwise"""
    P = np.unique(np.round(P, 7), axis=0); P = P[np.lexsort((P[:, 1], P[:, 0]))]
    def cr(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo_, up_ = [], []
    for p in P:
        while len(lo_) >= 2 and cr(lo_[-2], lo_[-1], p) <= 0: lo_.pop()
        lo_.append(p)
    for p in P[::-1]:
        while len(up_) >= 2 and cr(up_[-2], up_[-1], p) <= 0: up_.pop()
        up_.append(p)
    return np.array(lo_[:-1] + up_[:-1])
def resample_loop(Q, n):
    seg_ = length(np.roll(Q, -1, 0) - Q); cum_ = np.concatenate([[0], np.cumsum(seg_)])
    t_ = np.linspace(0, cum_[-1], n, endpoint=False)
    return np.stack([np.interp(t_, cum_, np.r_[Q[:, k], Q[0, k]]) for k in range(Q.shape[1])], -1)
def upsample(P, fr=4, fc=2):
    """bilinear refinement of a (R+1, C) grid whose columns wrap"""
    R1, C = P.shape[:2]
    jj = np.linspace(0, R1 - 1, (R1 - 1) * fr + 1); ii = np.arange(C * fc) / fc
    j0 = np.clip(np.floor(jj).astype(int), 0, R1 - 2); tj = (jj - j0)[:, None, None]
    i0 = np.floor(ii).astype(int); ti = (ii - i0)[None, :, None]; i1 = (i0 + 1) % C
    A_ = P[j0][:, i0] * (1 - ti) + P[j0][:, i1] * ti; B_ = P[j0 + 1][:, i0] * (1 - ti) + P[j0 + 1][:, i1] * ti
    return A_ * (1 - tj) + B_ * tj
def lift_to_hood(Q2, root, e1, e2, up):
    """2D points in the plane across the ear axis -> the hood surface, along the ear axis"""
    q = root + Q2[:, :1] * e1 + Q2[:, 1:] * e2
    lo_ = np.full(len(q), -0.09); hi_ = np.full(len(q), 0.09)
    assert (hood_level(q + lo_[:, None] * up) < 0).all() and (hood_level(q + hi_[:, None] * up) > 0).all()
    for _ in range(36):
        m = .5 * (lo_ + hi_); out = hood_level(q + m[:, None] * up) > 0
        hi_ = np.where(out, m, hi_); lo_ = np.where(out, lo_, m)
    return q + (.5 * (lo_ + hi_))[:, None] * up
for tag, s in (('L', 1), ('R', -1)):
    P_e = EAR[tag][0]; base, up, fwd, side, L = ns['ear_frame'](s); root = ns['ear_root'](s)
    e1 = side; e2 = np.cross(up, side)
    # the ear's crossing with the hood at rest (for the record)
    lv = hood_level(P_e.reshape(-1, 3)).reshape(P_e.shape[:2]); loop = []
    for c in range(P_e.shape[1]):
        r = int(np.argmax(lv[:, c] > 0)); assert r > 0, ('ear column starts outside the hood', tag, c)
        A_, B_ = P_e[r - 1, c], P_e[r, c]; fa, fb = lv[r - 1, c], lv[r, c]; loop.append(A_ + (fa / (fa - fb)) * (B_ - A_))
    loop = np.array(loop)
    # footprint, along the ear axis, of every ear point from the hood surface up to the piping's top
    pts2 = []
    for a_sw in EAR_SWING:                                       # a slit: the ear's footprint over its whole swing
        Dn = upsample(ear_pose(tag, s, a_sw)).reshape(-1, 3); lvD = hood_level(Dn)
        band = (lvD > -0.002) & (lvD < 1.6 * CUFF_R)
        pts2.append(np.stack([dot(Dn[band] - root, e1), dot(Dn[band] - root, e2)], -1))
    foot = hull2(np.concatenate(pts2))
    foot = resample_loop(foot, 96)
    ed = np.roll(foot, -1, 0) - foot; en = np.stack([ed[:, 1], -ed[:, 0]], -1); en /= length(en)[:, None]
    vn = en + np.roll(en, 1, 0); vn /= length(vn)[:, None]
    Q2 = circ_smooth(foot + (CUFF_CLEAR + CUFF_R) * vn, 3)
    Q2 = resample_loop(Q2, 28)
    Qc = lift_to_hood(Q2, root, e1, e2, up)
    nq = sdf_normals(HF, Qc)
    T = np.roll(Qc, -1, 0) - np.roll(Qc, 1, 0)
    T, Nn, Bn = tube_frame(T, nq)
    centre = Qc + 0.20 * CUFF_R * Nn
    NRC = 6; aa = 2 * PI * np.arange(NRC) / NRC
    ring = centre[None] + CUFF_R * (np.cos(aa)[:, None, None] * Nn[None] + np.sin(aa)[:, None, None] * Bn[None])
    SLIT[tag] = dict(loop=loop, Q=Qc, up=up, side=side, fwd=fwd, base=base, root=root, ring=ring, centre=centre, Nn=Nn)
    tot = float(length(np.roll(Qc, -1, 0) - Qc).sum())
    print('SLIT', tag, 'ear loop x', loop[:, 0].min().round(3), loop[:, 0].max().round(3), 'z', loop[:, 2].min().round(3), loop[:, 2].max().round(3),
          'piping perimeter', round(tot, 3), flush=True)

def inside_poly(px, py, poly):
    inside = np.zeros(px.shape, bool); n = len(poly)
    for k in range(n):
        x1, y1 = poly[k]; x2, y2 = poly[(k + 1) % n]
        cond = ((y1 > py) != (y2 > py)) & (px < (x2 - x1) * (py - y1) / (y2 - y1 + 1e-12) + x1)
        inside ^= cond
    return inside
def poly_dist(px, py, poly):
    best = np.full(px.shape, 1e9); n = len(poly)
    for k in range(n):
        a = poly[k]; b = poly[(k + 1) % n]; ab = b - a; L2 = max(ab @ ab, 1e-12)
        t = clamp01(((px - a[0]) * ab[0] + (py - a[1]) * ab[1]) / L2)
        best = np.minimum(best, np.hypot(px - a[0] - t * ab[0], py - a[1] - t * ab[1]))
    return best
def slit_mask(p):
    """1 inside an ear slit opening (projected along the ear's axis), soft at the edge."""
    m = np.zeros(p.shape[:-1])
    for tag, S_ in SLIT.items():
        q = p - S_['root']; near = (length(q) < 0.16) & (np.abs(dot(q, S_['up'])) < 0.07)
        if not near.any(): continue
        e1 = S_['side']; e2 = np.cross(S_['up'], e1)
        poly = np.stack([dot(S_['Q'] - S_['root'], e1), dot(S_['Q'] - S_['root'], e2)], -1)
        px, py = dot(q, e1), dot(q, e2)
        ins = inside_poly(px, py, poly) & near
        d = poly_dist(px, py, poly)
        m = np.maximum(m, ins * sstep(0.0, 0.005, d))
    return m

# ---------------- ear-spring check: the ears swing with the rig's own ear weights through the Animator's range
# (heroModels/animator.js, no ear tip: rotation x = r.x + 0.4 a, z = r.z +/- 0.2 a, |a| <= 1 is generous), and must
# neither touch the piping ring nor cross the hood outside the painted opening.
def closed_poly_dist3(P, C):
    best = np.full(P.shape[:-1], 1e9)
    for k in range(len(C)):
        a_, b_ = C[k], C[(k + 1) % len(C)]; ab = b_ - a_; t = clamp01(dot(P - a_, ab) / (ab @ ab))
        best = np.minimum(best, length(P - (a_ + t[..., None] * ab)))
    return best
EAR_CHECK = {}
for tag, s in (('L', 1), ('R', -1)):
    S_ = SLIT[tag]; e1 = S_['side']; e2 = np.cross(S_['up'], e1)
    poly = np.stack([dot(S_['Q'] - S_['root'], e1), dot(S_['Q'] - S_['root'], e2)], -1)
    res = {}
    for a in (-1.0, -0.6, -0.3, 0.0, 0.3, 0.6, 1.0):
        Pd = ear_pose(tag, s, a)
        dense = np.concatenate([Pd.reshape(-1, 3), (.5 * (Pd[1:] + Pd[:-1])).reshape(-1, 3),
                                (.5 * (Pd + np.roll(Pd, -1, 1))).reshape(-1, 3)])
        clr = float((closed_poly_dist3(dense, S_['centre']) - CUFF_R).min())
        lv = hood_level(Pd.reshape(-1, 3)).reshape(Pd.shape[:2]); cross = []
        for c in range(Pd.shape[1]):
            r = int(np.argmax(lv[:, c] > 0)); A_, B_ = Pd[r - 1, c], Pd[r, c]
            fa, fb = lv[r - 1, c], lv[r, c]; cross.append(A_ + (fa / (fa - fb)) * (B_ - A_))
        cross = np.array(cross) - S_['root']
        px, py = dot(cross, e1), dot(cross, e2)
        ins = inside_poly(px, py, poly); d = poly_dist(px, py, poly)
        margin = float(np.where(ins, d, -d).min()) - CUFF_R               # > 0: the crossing stays inside, clear of the piping
        res['a%+.1f' % a] = {'ear_to_piping_clearance_m': round(clr, 4), 'crossing_inside_opening_margin_m': round(margin, 4)}
    EAR_CHECK[tag] = res
    print('EAR_CHECK', tag, json.dumps(res), flush=True)

# ---------------- brass horns and the hood's back spikes
def hood_point(direction):
    d = nrm(direction); p = ray_exit(hood_level, HOOD_O, d[None])[0]
    return p, sdf_normals(HF, p[None])[0]

CONES = []   # dict(P, host, name)
def make_cone(base, up, back, H, ra, rb, lean=0.2, bend=0.0, NA=8, rows=(-0.20, 0.0, 0.28, 0.54, 0.74, 0.88, 0.96), tip=1.0, prof=0.55):
    up = nrm(up); back = nrm(back - np.dot(back, up) * up); side = np.cross(up, back)
    hs = np.array(rows)
    def cen(h): return base + H * (h * up + (lean * h + bend * h * h) * back)
    aa = 2 * PI * np.arange(NA) / NA
    P = [cen(hs[0] - 0.03)[None].repeat(NA, 0)]
    for h in hs:
        hh = max(h, 0.0)
        r = (1 - hh) ** prof * (1 + 0.10 * math.sin(PI * min(hh, 1)))
        t = cen(h + 0.01) - cen(h - 0.01); t /= np.linalg.norm(t)
        eb = back - np.dot(back, t) * t; eb /= np.linalg.norm(eb); es = np.cross(t, eb)
        P.append(cen(h) + r * (ra * np.cos(aa)[:, None] * eb + rb * np.sin(aa)[:, None] * es))
    P.append(cen(tip)[None].repeat(NA, 0))
    return np.array(P)

# horns: at the front-top corners of the hood, inside the ears, pointing up and a little out, curling back
HORN = {}
for tag, s in (('L', 1), ('R', -1)):
    p, n = hood_point([s * 0.33, -0.50, 0.80])
    upd = nrm(n + np.array([s * 0.10, 0.10, 0.85]))
    HORN[tag] = make_cone(p - 0.004 * n, upd, np.array([0, 1.0, 0.25]), H=0.046, ra=0.0225, rb=0.0225, lean=0.08, bend=0.26, NA=10,
                          rows=(-0.20, 0.0, 0.26, 0.50, 0.70, 0.85, 0.95), prof=0.62)
    print('HORN', tag, p.round(3), flush=True)
# back spikes on the hood midline: crown (largest) to the nape
HOOD_SPIKES = []
for ang, H, fat in ((14, 0.070, 1.15), (52, 0.056, 1.0), (88, 0.047, 1.0)):
    a = math.radians(ang); p, n = hood_point([0, math.sin(a), math.cos(a)])
    tang = np.array([0, math.cos(a), -math.sin(a)])
    HOOD_SPIKES.append(make_cone(p - 0.002 * n, nrm(n + np.array([0, 0.12, 0])), tang, H=H, ra=0.56 * H * fat, rb=0.40 * H * fat, lean=0.20))
    print('HOOD_SPIKE', ang, p.round(3), flush=True)

# ================================================================== 2b. COAT (back coat, collar to rump)
COAT_O = np.array(ns['BODY_C'], np.float64)                  # the base body grid's own star centre: every body point is visible
COAT_F = pole_frame([0, 0.725, 0.689], [0, 0.689, -0.725])           # phi = 0: down the rump (the seam, under the tail)
def coat_off(p): return 0.0088 + 0.0012 * sstep(0.22, 0.30, p[..., 2])
def coat_level(p): return body_sdf(p) - coat_off(p)
def Zhem(p):
    psi = np.arctan2(p[..., 0], p[..., 1] - 0.085)
    lobe = (0.5 + 0.5 * np.cos(12 * psi)) ** 1.5
    return 0.201 - 0.012 * lobe
COLLAR_C, COLLAR_N, COLLAR_FWD, COLLAR_RAD, CPHI = ns['COLLAR_C'], ns['COLLAR_N'], ns['COLLAR_FWD'], ns['COLLAR_RAD'], ns['cphi']
def collar_coords(p):
    q = p - COLLAR_C; h = dot(q, COLLAR_N); qr = q - h[..., None] * COLLAR_N
    ang = np.arctan2(qr[..., 0], dot(qr, COLLAR_FWD)) % (2 * PI)
    R = np.interp(ang, np.r_[CPHI, 2 * PI], np.r_[COLLAR_RAD, COLLAR_RAD[0]])
    return h, length(qr), R
def coat_cut(p):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    h, rho, R = collar_coords(p)
    gc = smax(-(h + 0.0175 + 0.0020), rho - (R + 0.0105), 0.006)   # below the collar's bottom edge, or behind the ring
    gfr = y - (-0.046 + 0.010 * sstep(0.26, 0.20, z))          # front edge down the side of the shoulder
    gh = z - Zhem(p)
    return smin(smin(gc, gfr, 0.012), gh, 0.010)
C_C, NJ_C = 48, 12
OUTER[0] = True
phi_c, thb_c = boundary_columns(coat_level, coat_cut, COAT_O, COAT_F, C_C, step=1.0)
s_rows_c = np.interp(np.arange(NJ_C + 1) / NJ_C, [0, .45, .80, 1], [0, .50, .84, 1])
THc = s_rows_c[:, None] * thb_c[None, :]
DC = dirs(COAT_F, THc, np.broadcast_to(phi_c, THc.shape))
bead_c = 0.0018 * sstep(0.80, 1.0, s_rows_c)[:, None] * np.ones((1, C_C))
COAT_SHELL = ray_exit(coat_level, COAT_O, DC, extra=bead_c)
COAT_SHELL[0] = COAT_SHELL[0].mean(0)
Sc = ray_exit(body_sdf, COAT_O, DC[-1]); nc = sdf_normals(body_sdf, Sc)
Pa = ray_exit(coat_level, COAT_O, dirs(COAT_F, thb_c + 0.02, phi_c)); Pb = ray_exit(coat_level, COAT_O, dirs(COAT_F, thb_c - 0.02, phi_c))
tc = Pa - Pb; tc -= dot(tc, nc)[:, None] * nc; tc /= length(tc)[:, None]
COAT_RIM = disk_rim(COAT_SHELL[-1], Sc, nc, tc, rows=3, tuck=0.0050)
COAT_P = np.concatenate([COAT_SHELL, COAT_RIM], 0)
COAT_N = grid_normals(COAT_P, COAT_O)
if os.environ.get('WHELP_DEBUG'):
    E_ = COAT_SHELL[-1]; h_, rho_, R_ = collar_coords(E_)
    for i in range(0, C_C, 2):
        e = E_[i]
        print('COAT_EDGE %2d phi %5.1f th %5.1f p %s gc %.4f gfr %.4f gh %.4f' % (i, math.degrees(phi_c[i]), math.degrees(thb_c[i]), e.round(3),
              float(smax(-(h_[i] + 0.0195), rho_[i] - (R_[i] + 0.0105), 0.006)), float(e[1] + 0.046 - 0.010 * sstep(0.26, 0.20, e[2])), float(e[2] - Zhem(e[None])[0])), flush=True)
OUTER[0] = False
print('COAT rows', COAT_P.shape, 'theta_b deg', np.degrees(thb_c).min().round(1), np.degrees(thb_c).max().round(1), flush=True)

def coat_point(x, y):
    """Coat outer surface straight above (x, y)."""
    zs = np.linspace(0.42, 0.10, 640); P = np.stack([np.full_like(zs, x), np.full_like(zs, y), zs], -1)
    v = coat_level(P); k = int(np.argmax(v < 0)); lo, hi = zs[k], zs[k - 1]
    for _ in range(30):
        m = .5 * (lo + hi)
        if coat_level(np.array([[x, y, m]]))[0] < 0: lo = m
        else: hi = m
    p = np.array([x, y, .5 * (lo + hi)]); return p, sdf_normals(body_sdf, p[None])[0]
COAT_SPIKES = []
for y, H in ((0.112, 0.050), (0.165, 0.046), (0.214, 0.040)):
    p, n = coat_point(0.0, y)
    COAT_SPIKES.append(make_cone(p - 0.002 * n, nrm(n + np.array([0, 0.10, 0])), np.array([0, 1.0, -0.2]), H=H, ra=0.56 * H, rb=0.40 * H, lean=0.22))
    print('COAT_SPIKE', p.round(3), flush=True)
# felt stars (painted): on the flanks, in the coat's own surface frame
STARS = []
for s in (1, -1):
    for (y, z, r, rotd) in ((0.040, 0.235, 0.020, 8), (0.150, 0.228, 0.017, -12)):
        xs = np.linspace(0.30 * s, 0, 600); P = np.stack([xs, np.full_like(xs, y), np.full_like(xs, z)], -1)
        k = int(np.argmax(coat_level(P) < 0)); p = P[k]; n = sdf_normals(body_sdf, p[None])[0]
        e1 = nrm(np.array([0, 1.0, 0]) - np.dot([0, 1.0, 0], n) * n); e2 = np.cross(n, e1)
        a = math.radians(rotd); e1, e2 = math.cos(a) * e1 + math.sin(a) * e2, -math.sin(a) * e1 + math.cos(a) * e2
        STARS.append(dict(c=p, n=n, e1=e1, e2=e2, r=r))

# wing mounts: the wing roots sit on the coat over the shoulder blades, behind the collar
WING = {}
WING_GLB = 'D:/projects/chewy-life-3d/public/models/shadow-whelp-wing.glb'
def wing_vertices():
    """the wing prop's vertices (build_wing.py runs first), read and removed again so they never reach the export"""
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=WING_GLB)
    new = [o for o in bpy.data.objects if o not in before]
    V = np.concatenate([np.array([tuple(o.matrix_world @ v.co) for v in o.data.vertices]) for o in new if o.type == 'MESH'])
    mats = {sl.material for o in new if o.type == 'MESH' for sl in o.material_slots if sl.material}
    imgs = {nd.image for m in mats if m.use_nodes for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image}
    meshes = {o.data for o in new if o.type == 'MESH'}
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    for m in meshes: bpy.data.meshes.remove(m)
    for m in mats: bpy.data.materials.remove(m)
    for i in imgs: bpy.data.images.remove(i)
    return V
def flapR(deg):
    t = math.radians(deg); c, s_ = math.cos(t), math.sin(t); return np.array([[c, 0, -s_], [0, 1, 0], [s_, 0, c]])
WV = wing_vertices(); WV_far = WV[length(WV) > 0.034]               # (only the root knob, r 3.0 cm, sits in the coat on purpose)
def head_level(p): return head_full(p) - hood_off(p)                # the hood's outer surface, without the body
FLAP_RANGE = (-30, 60)                                              # the game caps the flap here (round 2)
FLAPS = tuple(range(FLAP_RANGE[0], FLAP_RANGE[1] + 1, 15))
WING_SEARCH = {}
LIFT = 0.012
Y_SHOULDER = 0.155                                                  # round 2: at the shoulders, like the sheet
for x_m in (0.094, 0.110, 0.125, 0.140):
    for y_m in (Y_SHOULDER,):
        p, n = coat_point(x_m, y_m); m = p + LIFT * n
        clr = {f: (float(coat_level(m + WV_far @ flapR(f).T).min()), float(head_level(m + WV_far @ flapR(f).T).min())) for f in FLAPS}
        key = '%.3f,%.3f' % (x_m, y_m)
        WING_SEARCH[key] = {'flap%+d' % f: {'coat_m': round(c[0], 4), 'hood_m': round(c[1], 4)} for f, c in clr.items()}
        WING_SEARCH[key]['worst_m'] = round(min(min(c) for c in clr.values()), 4)
ok = [k for k, r in WING_SEARCH.items() if r['worst_m'] >= 0.003]
if ok: KEY = min(ok, key=lambda k: float(k.split(',')[0]))         # the innermost clean one
else: KEY = max(WING_SEARCH, key=lambda k: WING_SEARCH[k]['worst_m'])
X_MOUNT, Y_MOUNT = (float(v) for v in KEY.split(','))
print('WING_SEARCH', json.dumps({k: v['worst_m'] for k, v in WING_SEARCH.items()}), 'chosen', KEY, flush=True)
for tag, s in (('L', 1), ('R', -1)):
    p, n = coat_point(s * X_MOUNT, Y_MOUNT)
    WING[tag] = dict(p=p + LIFT * n, n=n)                     # the root knob (r 2.15 cm) sits half sunk in the coat

# ================================================================== 2c. BIB (cream belly scales)
BIB_O = np.array([0.0, -0.010, 0.200])
BIB_F = pole_frame([0, -0.55, -0.83], [0, -0.83, 0.55])       # pole on the chest's lower curve; phi = 0 toward the top
def bib_off(p): return 0.0068
def bib_level(p): return body_sdf(p) - bib_off(p)
def bib_cut(p):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    hw = 0.036 + 0.014 * sstep(-0.06, 0.02, y) - 0.010 * sstep(0.04, 0.10, y)
    g1 = hw - np.abs(x)
    g2 = 0.193 - 0.014 * (x / 0.042) ** 2 - z                       # arched top edge, below the tag
    g3 = 0.080 - y                                               # back end on the belly
    return smin(smin(g1, g2, 0.010), g3, 0.012)
C_B, NJ_B = 28, 6
OUTER[0] = True
phi_b, thb_b = boundary_columns(bib_level, bib_cut, BIB_O, BIB_F, C_B, th0=1.0, th1=120.0, step=0.5)
s_rows_b = np.interp(np.arange(NJ_B + 1) / NJ_B, [0, .5, 1], [0, .55, 1])
THb = s_rows_b[:, None] * thb_b[None, :]
DB = dirs(BIB_F, THb, np.broadcast_to(phi_b, THb.shape))
BIB_SHELL = ray_exit(bib_level, BIB_O, DB, extra=0.0012 * sstep(0.7, 1.0, s_rows_b)[:, None] * np.ones((1, C_B)))
BIB_SHELL[0] = BIB_SHELL[0].mean(0)
Sb = ray_exit(body_sdf, BIB_O, DB[-1]); nb = sdf_normals(body_sdf, Sb)
Pa = ray_exit(bib_level, BIB_O, dirs(BIB_F, thb_b + 0.02, phi_b)); Pb = ray_exit(bib_level, BIB_O, dirs(BIB_F, thb_b - 0.02, phi_b))
tb = Pa - Pb; tb -= dot(tb, nb)[:, None] * nb; tb /= length(tb)[:, None]
BIB_RIM = disk_rim(BIB_SHELL[-1], Sb, nb, tb, rows=3, tuck=0.0045)
BIB_P = np.concatenate([BIB_SHELL, BIB_RIM], 0)
BIB_N = grid_normals(BIB_P, BIB_O)
OUTER[0] = False
print('BIB rows', BIB_P.shape, 'z', BIB_P[..., 2].min().round(3), BIB_P[..., 2].max().round(3), 'y', BIB_P[..., 1].min().round(3), BIB_P[..., 1].max().round(3), flush=True)

# ================================================================== 2d. TAIL COVER
TAIL_C, TAIL_AX = ns['TAIL_C'], ns['TAIL_AX']
TAIL_CTRL = np.array([TAIL_C - 0.040 * TAIL_AX, TAIL_C - 0.005 * TAIL_AX, [0, 0.292, 0.266], [0, 0.345, 0.283],
                      [0, 0.400, 0.284], [0, 0.446, 0.291], [0, 0.482, 0.306]])
TAIL_LINE = ns['catmull_chain'](TAIL_CTRL, 8)
seg = length(np.diff(TAIL_LINE, axis=0)); cum = np.concatenate([[0], np.cumsum(seg)])
NT = 16; tsamp = np.interp(np.arange(NT + 1) / NT, [0, .15, .5, 1], [0, .12, .48, 1]) * cum[-1]
TL = np.stack([np.interp(tsamp, cum, TAIL_LINE[:, k]) for k in range(3)], -1)
TT = np.gradient(TL, axis=0)
TT, TN, TB = tube_frame(TT, np.array([0, 0, 1.0]))
u_t = tsamp / cum[-1]
r_t = np.interp(u_t, [0, 0.10, 0.20, 0.45, 0.75, 0.93, 1.0], [0.044, 0.050, 0.049, 0.037, 0.024, 0.013, 0.0])
r_t = np.where(u_t > 0.93, 0.013 * np.sqrt(np.maximum(0, 1 - ((u_t - 0.93) / 0.07) ** 2)), r_t)
CT = 14; at = 2 * PI * np.arange(CT) / CT
squash = 0.92                                                    # a touch taller than wide
TAIL_P = (TL[:, None] + r_t[:, None, None] * (np.cos(at)[None, :, None] * TN[:, None] * 1.0 +
                                              np.sin(at)[None, :, None] * TB[:, None] * squash))
TAIL_P[0] = TL[0]; TAIL_P[-1] = TL[-1] + 0.004 * TT[-1]
TAIL_N = grid_normals(TAIL_P, TL.mean(0))
nub_r = length(ns['TAIL_P'].reshape(-1, 3)[:, None] - TL[None]).min(1)
print('TAIL length', round(cum[-1], 3), flush=True)
TAIL_SPIKES = []
for u, H in ((0.30, 0.037), (0.48, 0.032), (0.65, 0.027), (0.80, 0.021)):
    k = int(round(u * NT)); c = TL[k]; up_ = TN[k]
    TAIL_SPIKES.append(make_cone(c + (r_t[k] - 0.002) * up_, up_, TT[k], H=H, ra=0.56 * H, rb=0.40 * H, lean=0.24))
TAIL_TIP = make_cone(TL[-2] - 0.002 * TT[-2], TT[-1], -TN[-1], H=0.036, ra=0.0135, rb=0.0115, lean=0.0, rows=(-0.25, 0.0, 0.30, 0.58, 0.80, 0.93))
# star on each side of the tail (painted)
for s in (1, -1):
    k = int(round(0.40 * NT)); c = TL[k] + s * r_t[k] * TB[k] * squash
    n = nrm(s * TB[k]); e1 = TT[k]; e2 = np.cross(n, e1)
    STARS.append(dict(c=c, n=n, e1=e1, e2=e2, r=0.014, tail=True))

# ================================================================== 3. paint the costume charts
def speckle(p, amp=0.025, cell=0.0016):
    q = np.floor(p / cell)
    h = np.sin(q[..., 0] * 12.9898 + q[..., 1] * 78.233 + q[..., 2] * 37.719) * 43758.5453
    return 1 + amp * (2 * (h - np.floor(h)) - 1)
def felt(p, n, base='emerald', light='em_light', shade='em_shade', amp=0.022):
    C = mix(wc(base), wc(light), 0.50 * sstep(0.25, 0.95, n[..., 2]))
    C = mix(C, wc(shade), 0.65 * sstep(0.0, 0.85, -n[..., 2]))
    return C * speckle(p, amp)[..., None]
def star_mask(p):
    m = np.zeros(p.shape[:-1]); edge = np.zeros(p.shape[:-1])
    for S_ in STARS:
        q = p - S_['c']; near = (length(q) < 2 * S_['r']) & (dot(q, S_['n']) > -0.02)
        if not near.any(): continue
        a = dot(q, S_['e1']) / S_['r']; b = dot(q, S_['e2']) / S_['r']
        d = (np.abs(a) ** (2 / 3) + np.abs(b) ** (2 / 3))          # astroid: a 4-point star
        m = np.maximum(m, near * (1 - sstep(0.90, 1.02, d)))
        edge = np.maximum(edge, near * (1 - sstep(0.0, 0.25, np.abs(d - 0.96))))
    return m, edge
def brass_col(n_z, v):
    C = mix(wc('br_shade'), wc('brass'), sstep(0.0, 0.45, v))
    return mix(C, wc('br_light'), 0.55 * sstep(0.55, 1.0, v))

def paint_hood(p, n, U, V):
    C = felt(p, n)
    R = HOOD_P.shape[0] - 1; row = V * R
    # stitch line just inside the hem, dashed
    st = (1 - sstep(0.10, 0.22, np.abs(row - (HOOD_EDGE_ROW - 0.55)))) * (np.sin(U * C_H * 3 * 2 * PI) > 0.1)
    C = mix(C, wc('em_stitch'), 0.70 * st)
    # the hem's curl into the skin: a soft shade
    C = mix(C, wc('em_shade'), 0.35 * sstep(HOOD_EDGE_ROW + 0.6, HOOD_EDGE_ROW + 2.6, row))
    sm = slit_mask(p)                                            # inside a slit: a shadowed fold of the same felt
    C = mix(C, mix(wc('slit'), wc('slit_deep'), 0.5) * speckle(p, 0.02)[..., None], sm)
    return C
def paint_coat(p, n, U, V):
    C = felt(p, n)
    R = COAT_P.shape[0] - 1; row = V * R
    st = (1 - sstep(0.10, 0.22, np.abs(row - (NJ_C - 0.55)))) * (np.sin(U * C_C * 3 * 2 * PI) > 0.1)
    C = mix(C, wc('em_stitch'), 0.70 * st)
    C = mix(C, wc('em_shade'), 0.35 * sstep(NJ_C + 0.6, NJ_C + 2.6, row))
    m, e = star_mask(p)
    C = mix(C, brass_col(n[..., 2], 0.55 + 0.25 * clamp01(n[..., 2])), m)
    C = mix(C, wc('br_shade'), 0.45 * e * m)
    return C
def paint_tail(p, n, U, V):
    C = felt(p, n)
    m, e = star_mask(p)
    C = mix(C, brass_col(n[..., 2], 0.6), m); C = mix(C, wc('br_shade'), 0.45 * e * m)
    return C
def paint_bib(p, n, U, V):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    q = (0.196 - z) + np.maximum(0, y + 0.075) * 0.9            # down the chest, then back along the belly
    dq, dx = 0.020, 0.024
    Q = q / dq; k = np.floor(Q); X = x / dx
    def cell(r):
        cx = np.floor(X - 0.5 * (r % 2)) + 0.5 + 0.5 * (r % 2)
        lobe = 0.55 * np.sqrt(np.maximum(0, 1 - (2 * (X - cx)) ** 2))
        return lobe
    lobe_prev = cell(k - 1); in_prev = (Q - k) <= lobe_prev
    lobe_k = cell(k)
    dist = np.where(in_prev, lobe_prev - (Q - k), 1 + lobe_k - (Q - k))   # distance (rows) to the scale's lower scallop
    frac = np.where(in_prev, (Q - k + 1) / (1 + lobe_prev), (Q - k) / (1 + lobe_k))
    C = mix(wc('cr_light'), wc('cream'), sstep(0.1, 0.9, frac))
    C = mix(C, wc('cr_shade'), 0.8 * (1 - sstep(0.0, 0.22, dist)))
    C = mix(C, wc('cr_line'), 0.85 * (1 - sstep(0.0, 0.07, dist)))
    C = mix(C, wc('cr_shade'), 0.45 * sstep(0.0, 0.85, -n[..., 2]) * 0.6)
    R = BIB_P.shape[0] - 1; row = V * R
    trim = sstep(NJ_B - 0.75, NJ_B - 0.45, row)                  # a soft cream-tan hem (the edge's roll)
    C = mix(C, wc('cr_shade'), 0.85 * trim)
    C = mix(C, wc('cr_line'), 0.35 * trim * sstep(NJ_B + 1.0, NJ_B + 2.6, row))
    return C * speckle(p, 0.015)[..., None]

CHART_GRID = {'hood': (HOOD_P, HOOD_N, 'sphere', paint_hood), 'coat': (COAT_P, COAT_N, 'sphere', paint_coat),
              'tail': (TAIL_P, TAIL_N, 'sphere', paint_tail), 'bib': (BIB_P, BIB_N, 'sphere', paint_bib)}
ext = np.zeros((AH - 2048, AW, 3), np.float64); ext[:] = wc('emerald')
def put(chart, C):
    x, y, w, h = CH[chart]; ext[y - 2048:y - 2048 + h, x:x + w] = C
for chart, (P, N, kind, fn) in CHART_GRID.items():
    x, y, w, h = CH[chart]
    u = np.clip((np.arange(w) + .5 - G) / (w - 2 * G), 0, 1); v = np.clip((np.arange(h) + .5 - G) / (h - 2 * G), 0, 1)
    U, V = np.meshgrid(u, v)
    Pp = grid_lookup(P, U, V, kind); Nn = grid_lookup(N, U, V, kind); Nn /= np.maximum(length(Nn)[..., None], 1e-12)
    put(chart, fn(Pp, Nn, U, V))
# brass (shared by every horn and spike: u around, v base -> tip) and the cuff piping (u along, v around the tube)
x, y, w, h = CH['brass']
v = np.clip((np.arange(h) + .5 - G) / (h - 2 * G), 0, 1)[:, None] * np.ones((1, w))
pseudo = np.stack(list(np.meshgrid(np.arange(w) * 0.002, np.arange(h) * 0.002)) + [np.zeros((h, w))], -1)
put('brass', brass_col(None, v) * speckle(pseudo, 0.02, 0.004)[..., None])
x, y, w, h = CH['cuff']
va = np.clip((np.arange(h) + .5 - G) / (h - 2 * G), 0, 1)[:, None] * np.ones((1, w))
nz = np.cos(2 * PI * va)                                        # tube angle 0 = the hood normal (up-ish)
put('cuff', felt(pseudo, np.stack([np.zeros_like(nz), np.zeros_like(nz), 0.6 * nz], -1)))

base_u8 = WHELP_BASE_ATLAS if RIG_MODE else ns['atlas_u8']
ext_u8 = np.round(clamp01(ext) * 255).astype(np.uint8)
atlas_full = np.concatenate([base_u8, ext_u8], 0)                # rows from the bottom (Blender v)
def png_chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
atlas_path = os.path.join(TASK, 'shadow-whelp_rig_atlas.png' if RIG_MODE else 'shadow-whelp_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas_full[::-1])
with open(atlas_path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', AW, AH, 8, 2, 0, 0, 0)) +
            png_chunk(b'IDAT', zlib.compress(raw, 9)) + png_chunk(b'IEND', b''))
img = bpy.data.images.load(atlas_path); img.name = 'Shadow_whelp_atlas'; img.pack()
for node in mat.node_tree.nodes:
    if node.type == 'TEX_IMAGE': node.image = img
mat.name = 'Shadow_whelp_atlas'
# his UVs: same pixels in the taller image
VS = 2048 / AH
for ob in SHADOW.values():
    uvl = ob.data.uv_layers.active.data
    uv = np.empty(len(uvl) * 2, np.float64); uvl.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    uv[:, 1] *= VS; uvl.foreach_set('uv', uv.ravel())

# ================================================================== 4. costume meshes
def tube_mesh(name, ring, chart, O):
    return grid_mesh(name, ring, 'torus', chart, O, wrap_v=True)
objs = {}
def join(name, obs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    ob = bpy.context.object; ob.name = name; ob.data.name = name
    return ob
hood_parts = [grid_mesh('hood_shell', HOOD_P, 'disk', 'hood', HOOD_O, pole0=True)]
for tag, S_ in SLIT.items():
    hood_parts.append(grid_mesh('cuff_' + tag, S_['ring'], 'torus', 'cuff', S_['centre'].mean(0) + 0.0 * S_['up'], wrap_v=True))
CONE_LIST = list(HORN.values()) + HOOD_SPIKES + COAT_SPIKES + TAIL_SPIKES + [TAIL_TIP]
def ustrip(P):
    k = next(i for i, Q in enumerate(CONE_LIST) if Q is P); return (k / len(CONE_LIST), (k + 1) / len(CONE_LIST))
for tag, P in HORN.items(): hood_parts.append(grid_mesh('horn_' + tag, P, 'capsule', 'brass', P[1].mean(0), pole0=True, poleR=True, urange=ustrip(P)))
for k, P in enumerate(HOOD_SPIKES): hood_parts.append(grid_mesh('hspike_%d' % k, P, 'capsule', 'brass', P[1].mean(0), pole0=True, poleR=True, urange=ustrip(P)))
coat_parts = [grid_mesh('coat_shell', COAT_P, 'disk', 'coat', COAT_O, pole0=True), grid_mesh('bib', BIB_P, 'disk', 'bib', BIB_O, pole0=True)]
for k, P in enumerate(COAT_SPIKES): coat_parts.append(grid_mesh('cspike_%d' % k, P, 'capsule', 'brass', P[1].mean(0), pole0=True, poleR=True, urange=ustrip(P)))
tail_parts = [grid_mesh('tail_cover', TAIL_P, 'capsule', 'tail', TL.mean(0), pole0=True, poleR=True)]
for k, P in enumerate(TAIL_SPIKES + [TAIL_TIP]): tail_parts.append(grid_mesh('tspike_%d' % k, P, 'capsule', 'brass', P[1].mean(0), pole0=True, poleR=True, urange=ustrip(P)))
# the cuff's outward test point must be its tube centre line, not one point: fix its winding per ring
COSTUME = {'Whelp_hood': join('Whelp_hood', hood_parts), 'Whelp_coat': join('Whelp_coat', coat_parts), 'Whelp_tail': join('Whelp_tail', tail_parts)}
PIVOTS = {'Whelp_hood': (0, -0.02, 0.335), 'Whelp_coat': (0, 0, 0), 'Whelp_tail': tuple(TAIL_C - 0.02 * TAIL_AX)}
for nm, ob in COSTUME.items():
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bad = [f for f in bm.faces if f.calc_area() < 1e-12]
    if bad: bmesh.ops.delete(bm, geom=bad, context='FACES')
    bm.to_mesh(ob.data); bm.free()
    bpy.context.scene.cursor.location = PIVOTS[nm]
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    for v in ob.data.vertices: assert all(math.isfinite(c) for c in v.co)
    for p in ob.data.polygons: assert all(math.isfinite(c) for c in p.normal)
    ob['costume'] = 'shadow-whelp'; ob['front_axis'] = '-Y'

# ================================================================== 5. records, checks, save, export
measure = {'base_md5': BASE_MD5, 'archive_md5': ARCHIVE_MD5, 'atlas': [AW, AH], 'costume_charts': CH}
tri = {}
for ob in list(SHADOW.values()) + list(COSTUME.values()):
    ob.data.calc_loop_triangles(); tri[ob.name] = len(ob.data.loop_triangles)
measure['triangles'] = tri
measure['triangles_shadow'] = sum(v for k, v in tri.items() if k.startswith('Shadow_'))
measure['triangles_costume'] = sum(v for k, v in tri.items() if k.startswith('Whelp_'))
measure['costume_ratio'] = round(measure['triangles_costume'] / measure['triangles_shadow'], 3)
print('TRIANGLES', json.dumps(tri), 'costume', measure['triangles_costume'], 'ratio', measure['costume_ratio'], flush=True)
# clearance: costume shells over the skin
measure['hood_min_clearance_m'] = float(HF(HOOD_SHELL[1:].reshape(-1, 3)).min())
measure['coat_min_clearance_m'] = float(body_sdf(COAT_SHELL[1:].reshape(-1, 3)).min())
measure['bib_min_clearance_m'] = float(body_sdf(BIB_SHELL[1:].reshape(-1, 3)).min())
measure['tail_cover_min_clearance_to_nub_m'] = float(tail_sdf(TAIL_P[2:-1].reshape(-1, 3)).min())
tagP = ns['TAG_P'].reshape(-1, 3)
measure['tag_to_bib_min_m'] = float(bib_level(tagP).min())
measure['ear_slits'] = {t: {'loop_z': [float(S_['loop'][:, 2].min()), float(S_['loop'][:, 2].max())],
                            'cuff_gap_m': CUFF_GAP, 'cuff_tube_r_m': CUFF_R, 'ear_spring_check': EAR_CHECK[t]} for t, S_ in SLIT.items()}
# wing mounts (game axes: x, z, -y)
def g3(p): return [round(float(p[0]), 4), round(float(p[2]), 4), round(float(-p[1]), 4)]
BODY_BONE = np.array([0.0, 0.07, 0.21])                         # the rig's body bone head (joints-rig.json)
wm = {'units': 'metres', 'game_axes': 'three.js: Y up, front +Z; game = (bx, bz, -by)',
      'body_bone_head_game': g3(BODY_BONE), 'body_bone_rest': 'identity orientation (rig_shadow-toy.py), so the bone frame is the model frame moved to the bone head',
      'wing_glb': '/models/shadow-whelp-wing.glb (the LEFT wing; mirror x for the right one)'}
for tag, W_ in WING.items():
    wm[tag] = {'model_blender': [round(float(c), 4) for c in W_['p']], 'model_game': g3(W_['p']),
               'body_bone_frame_game': g3(W_['p'] - BODY_BONE), 'surface_normal_game': g3(W_['n'])}
wm['flapRange'] = list(FLAP_RANGE)
wm['clearance_search'] = {'note': 'min signed distance of the wing (outside its root knob) to the coat and to the hood, per flap over flapRange; at the shoulders (y 0.155), the innermost x with >= 3 mm at every flap', 'candidates_x_y_blender': WING_SEARCH, 'chosen_x_y_blender': [X_MOUNT, Y_MOUNT]}
wm['notes'] = ['The wing root (the prop origin) goes at the mount, the prop axes parallel to the body bone: +X span outward '
               '(mirror for the right wing), +Z forward, +Y up; at flap 0 the membrane is level.',
               'Flap = rotation about the prop\'s +Z (forward) axis at its root: + raises the tip. For the right wing (mirrored), '
               'the same visual flap is the negative angle.', 'flapRange: the game caps the flap at -30 (down stroke) .. +60 deg (up stroke); the clearances are checked over it.']
json.dump(wm, open(os.path.join(TASK, 'wing_mount.json'), 'w', encoding='utf-8'), indent=1)
measure['wing_mount'] = wm
cones = {'horn': list(HORN.values()), 'spike': HOOD_SPIKES + COAT_SPIKES + TAIL_SPIKES + [TAIL_TIP]}
ref = {'charts': CH, 'atlas': [AW, AH], 'hood_O': HOOD_O.tolist(), 'coat_O': COAT_O.tolist(), 'bib_O': BIB_O.tolist(),
       'tail_line': TL.tolist(), 'cuff_lines': {t: S_['centre'].tolist() for t, S_ in SLIT.items()},
       'cone_axes': [[P[1].mean(0).tolist(), P[-1][0].tolist()] for P in CONE_LIST]}
json.dump(ref, open(os.path.join(TASK, 'costume_ref.json'), 'w', encoding='utf-8'))
json.dump(measure, open(os.path.join(TASK, 'measure.json'), 'w', encoding='utf-8'), indent=1)
# his objects, for the lock check (world-space vertices and pixel-space UVs)
lock = {}
for nm, ob in SHADOW.items():
    co = np.array([tuple(ob.matrix_world @ v.co) for v in ob.data.vertices])
    uvl = ob.data.uv_layers.active.data; uv = np.empty(len(uvl) * 2, np.float64); uvl.foreach_get('uv', uv)
    lock[nm + '__co'] = co; lock[nm + '__uvpx'] = uv.reshape(-1, 2) * np.array([AW, AH])
np.savez(os.path.join(TASK, 'lock-parts.npz'), **lock)

bpy.ops.object.select_all(action='DESELECT')
allobs = list(SHADOW.values()) + list(COSTUME.values())
for ob in allobs: ob.select_set(True)
bpy.context.view_layer.objects.active = allobs[0]
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK, 'shadow-whelp.blend'))
bpy.ops.export_scene.gltf(filepath=MODEL, export_format='GLB', use_selection=True, export_apply=True,
                          export_yup=True, export_attributes=True, export_vertex_color='ACTIVE',
                          export_lights=False, export_cameras=False, export_animations=False)
print('WHELP_BUILD_DONE', MODEL, flush=True)
