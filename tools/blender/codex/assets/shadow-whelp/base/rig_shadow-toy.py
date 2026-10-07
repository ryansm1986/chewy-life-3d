"""Shadow (Toybox Boston terrier) phase-2 rig for the game's quad contract (hero_export.py --contract quad).

Blender 4.3:  blender --background --factory-startup --python rig_shadow-toy.py

1. Runs the approved model build (build_shadow-toy.py) unchanged, minus its .blend save and GLB export.
2. Cuts the muzzle along the painted "w" smile (coincident lip rims, interpolated UVs and normals, so the rest
   surface is identical), adds a closed mouth pocket and a tongue.
3. Fits rigid upper/lower lid shells per eye (see fit_lid): each shell is defined in its target pose as a surface
   hugging the eye/skin with a small gap over the region it must cover, tucked under the skin elsewhere, and clamped
   so that at rest (and at the game's neutral lidD = -0.10) it lies under the skin with a margin.
4. Builds the 21-bone quad skeleton (identity rest orientations, so pose rotations are world-axis rotations about the
   bone heads, exactly like the game), binds smooth spatial weights (<= 4 influences, quantized to sum 255) and saves
   shadow-toy_rig.blend with only Armature modifiers.
"""
import bpy, bmesh, math, json, os, sys, struct, zlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(ROOT, 'build_shadow-toy.py')
src = open(BUILD, encoding='utf-8').read()
marker = 'objects = []\nfor g, obs in groups.items():'
hook = ("for _g, _obs in groups.items():\n"
        "    for _ob in _obs:\n"
        "        _vg = _ob.vertex_groups.new(name='_part_' + _ob.name)\n"
        "        _vg.add(list(range(len(_ob.data.vertices))), 1.0, 'REPLACE')\n")
assert marker in src
src = src.replace(marker, hook + marker)
a_ = src.index("bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'shadow-toy.blend'))")
b_ = src.index("print('SHADOW_BUILD_DONE'")
src = src[:a_] + src[b_:]
ns = {'__file__': BUILD, '__name__': 'shadow_build'}
exec(compile(src, BUILD, 'exec'), ns)

PI = math.pi
sstep, smin, sd_se, nrm, length, dot = ns['sstep'], ns['smin'], ns['sd_se'], ns['nrm'], ns['length'], ns['dot']
rgb, mix, fur_colour, white_colour = ns['rgb'], ns['mix'], ns['fur_colour'], ns['white_colour']
W, ZC, EYE, open_pts = ns['W'], ns['ZC'], ns['EYE'], ns['open_pts']
head_full, body_sdf, head_white_mask = ns['head_full'], ns['body_sdf'], ns['head_white_mask']
polyline_dist, mat, CHARTS, G = ns['polyline_dist'], ns['mat'], ns['CHARTS'], ns['G']
def sm(a, b, x): return float(sstep(a, b, x))
STATS = {}

# ------------------------------------------------------------------ objects in world space, part labels
objs = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH'}
labels = {}
for o in objs.values():
    names = [g.name[len('_part_'):] for g in o.vertex_groups]
    labels[o.name] = [names[max(v.groups, key=lambda g: g.weight).group] for v in o.data.vertices]
    o.data.transform(o.matrix_world.copy())
    o.matrix_world = Matrix.Identity(4)
    o.vertex_groups.clear()
head, body = objs['Shadow_head'], objs['Shadow_body']
eyes = {t: objs['Shadow_eye_' + t] for t in 'LR'}
ears = {t: objs['Shadow_ear_' + t] for t in 'LR'}
tail = objs['Shadow_tail']
bpy.context.view_layer.update()

def mesh_bvh(obs):
    V, F, off = [], [], 0
    for o in obs:
        V += [v.co.copy() for v in o.data.vertices]
        F += [tuple(i + off for i in p.vertices) for p in o.data.polygons]
        off += len(o.data.vertices)
    return BVHTree.FromPolygons(V, F)
BVH_U = mesh_bvh([head, eyes['L'], eyes['R']])      # the visible union surface (before the cut; same surface)

# ================================================================== 1. smile cut
SM3 = np.asarray(ns['SMILE3']); order = np.argsort(SM3[:, 0]); SM3 = SM3[order]
def smile_z(x): return np.interp(x, SM3[:, 0], SM3[:, 2])
_SMw = np.asarray(ns['SMILE'])
X_LOBE = float(abs(_SMw[np.argmin(np.where(_SMw[:, 0] < 0, _SMw[:, 1], 9)), 0]))   # the w's lobe bottoms
Z_LOBE = float(smile_z(X_LOBE))
def cut_z(x):
    x = np.asarray(x, float)
    return np.where(np.abs(x) <= X_LOBE, np.minimum(smile_z(x), Z_LOBE), smile_z(x))
X_SEP = float(ns['SMILE'][-1][0])                   # the "w" corners: the lips part inside |x| <= X_SEP
Z_CORNER = float(smile_z(X_SEP))
X_CUT = X_SEP + 0.010
me = head.data
me.calc_loop_triangles()
CO = np.array([v.co[:] for v in me.vertices]); NO = np.array([v.normal[:] for v in me.vertices])
LV = np.array([l.vertex_index for l in me.loops]); LUV = np.array([d.uv[:] for d in me.uv_layers.active.data])
hlab = labels['Shadow_head']
is_face = np.array([l == 'head' for l in hlab])
FZ = CO[:, 2] - cut_z(CO[:, 0]); FZ = np.where(np.abs(FZ) < 1e-7, 1e-7, FZ)
cut_ok = is_face & (np.abs(CO[:, 0]) < X_CUT) & (CO[:, 1] < -0.12) & (np.abs(FZ) < 0.02)
split, cut_tris = {}, set()
for tri in me.loop_triangles:
    vs = [LV[l] for l in tri.loops]
    if not all(cut_ok[v] for v in vs): continue
    f = FZ[vs]
    if not (f.min() < 0 < f.max()): continue
    cut_tris.add(tri.index)
    for i in range(3):
        la, lb = tri.loops[i], tri.loops[(i + 1) % 3]
        a, b = LV[la], LV[lb]
        if FZ[a] * FZ[b] < 0 and (min(a, b), max(a, b)) not in split:
            if a > b: la, lb, a, b = lb, la, b, a
            t = FZ[a] / (FZ[a] - FZ[b])
            n = NO[a] + t * (NO[b] - NO[a])
            split[(a, b)] = (CO[a] + t * (CO[b] - CO[a]), LUV[la] + t * (LUV[lb] - LUV[la]), n / np.linalg.norm(n))
verts, vnorm, vinfo, cache, faces, fuvs = [], [], [], {}, [], []
def vertex(rec, side):
    kind, key, co, uv, n, f = rec
    if kind == 'v':
        k = ('v', key); info = ('v', 'L' if FZ[key] < 0 else 'U', hlab[key])
    else:
        sep = abs(co[0]) <= X_SEP
        k = ('s', key, side if sep else 'S'); info = ('s', side if sep else 'S', 'head')
    if k not in cache:
        cache[k] = len(verts); verts.append(tuple(co)); vnorm.append(tuple(n)); vinfo.append(info)
    return cache[k]
def emit(recs, side):
    if len(recs) < 3: return
    ids = [vertex(r, side) for r in recs]; uvs = [tuple(r[3]) for r in recs]; P = [np.array(verts[i]) for i in ids]
    best = None
    for s0 in range(len(ids)):                      # the fan start with the largest minimum triangle area
        ar = [np.linalg.norm(np.cross(P[(s0 + k) % len(P)] - P[s0], P[(s0 + k + 1) % len(P)] - P[s0]))
              for k in range(1, len(P) - 1)]
        if best is None or min(ar) > best[0]: best = (min(ar), s0)
    s0 = best[1]
    for k in range(1, len(ids) - 1):
        tri = [s0, (s0 + k) % len(ids), (s0 + k + 1) % len(ids)]
        A = np.linalg.norm(np.cross(P[tri[1]] - P[tri[0]], P[tri[2]] - P[tri[0]]))
        if A < 1e-12: continue
        faces.append([ids[t] for t in tri]); fuvs.append([uvs[t] for t in tri])
for tri in me.loop_triangles:
    recs = []
    for i in range(3):
        l = tri.loops[i]; v = LV[l]; vn = LV[tri.loops[(i + 1) % 3]]
        recs.append(('v', v, CO[v], LUV[l], NO[v], FZ[v]))
        key = (min(v, vn), max(v, vn))
        if key in split:
            co, uv, n = split[key]; recs.append(('s', key, co, uv, n, 0.0))
    if tri.index in cut_tris:
        emit([r for r in recs if r[5] >= 0], 'U'); emit([r for r in recs if r[5] <= 0], 'L')
    else:
        emit(recs, 'U' if np.mean([r[5] for r in recs]) >= 0 else 'L')
me2 = bpy.data.meshes.new('Shadow_head'); me2.from_pydata(verts, [], faces); me2.update()
uvl = me2.uv_layers.new(name='Atlas')
for poly, uu in zip(me2.polygons, fuvs):
    poly.use_smooth = True
    for li, u in zip(poly.loop_indices, uu): uvl.data[li].uv = u
me2.normals_split_custom_set([vnorm[me2.loops[li].vertex_index] for poly in me2.polygons for li in poly.loop_indices])
me2.materials.append(mat)
old_head_mesh = head.data; head.data = me2
seam_sep = sorted({verts[i][0]: i for i, inf in enumerate(vinfo) if inf[0] == 's' and inf[1] == 'U'}.items())
seam_shared = [verts[i] for i, inf in enumerate(vinfo) if inf[0] == 's' and inf[1] == 'S']
assert len(seam_sep) >= 10, len(seam_sep)
RIM_U = [np.array(verts[i]) for _, i in seam_sep]
ends = []
for sgn in (-1, 1):
    cand = [p for p in seam_shared if sgn * p[0] > X_SEP]
    ends.append(np.array(min(cand, key=lambda p: abs(p[0])) if cand else RIM_U[0 if sgn < 0 else -1]))
RIM = [ends[0]] + RIM_U + [ends[1]]
STATS['smile_cut'] = {'cut_triangles': len(cut_tris), 'separated_rim_points': len(RIM_U), 'x_sep': X_SEP, 'z_corner': Z_CORNER}

# ================================================================== 2. skeleton positions
EYE_C = {t: EYE[t]['c'] for t in 'LR'}
def ear_root(s): return ns['ear_root'](s)
TAIL_C, TAIL_AX = ns['TAIL_C'], ns['TAIL_AX']
k = 0.0
while body_sdf((TAIL_C - k * TAIL_AX)[None])[0] > 0: k += 0.001
TAIL_ROOT = TAIL_C - k * TAIL_AX
FL, HL = ns['FRONT_LEG'], ns['HIND_LEG']
corner_y = float(np.interp(X_SEP, SM3[:, 0], SM3[:, 1]))
P = {'root': (0, 0.04, 0), 'body': (0, 0.07, 0.21), 'neck': (0, -0.03, 0.285), 'head': (0, -0.01, 0.335),
     'jaw': (0, -0.12, Z_CORNER),
     'legFL': (FL[0], FL[1], 0.215), 'legFR': (-FL[0], FL[1], 0.215),
     'legBL': (HL[0], HL[1] - 0.007, 0.215), 'legBR': (-HL[0], HL[1] - 0.007, 0.215),
     'tail1': tuple(TAIL_ROOT), 'tail2': tuple(TAIL_C + 0.010 * TAIL_AX)}
for t, s in (('L', 1), ('R', -1)):
    P['eye_' + t] = tuple(EYE_C[t])
    P['lip_' + t] = (s * X_SEP, corner_y, Z_CORNER)
    P['ear_' + t] = tuple(ear_root(s))

# ================================================================== 3. lid shells
def ray_S(x, Qy, Qz, a):
    d = Vector((0.0, -math.cos(a), math.sin(a)))
    org = Vector((x, Qy, Qz)) + d * 0.5
    hit = BVH_U.ray_cast(org, -d, 1.0)[0]
    return 0.5 - (hit - org).length if hit is not None else 0.0
def S_vec(xs, Q, aa):
    return np.array([[ray_S(float(x), Q[0], Q[1], float(a)) for a in row] for x, row in zip(xs, aa)])
def inside_poly(px, pz, poly):
    x, z = poly[:, 0], poly[:, 1]; x2, z2 = np.roll(x, -1), np.roll(z, -1)
    px = np.asarray(px)[..., None]; pz = np.asarray(pz)[..., None]
    c = ((z > pz) != (z2 > pz)) & (px < (x2 - x) * (pz - z) / (z2 - z + 1e-15) + x)
    return (c.sum(-1) % 2) == 1
def signed_poly(px, pz, poly):
    px = np.asarray(px, float); pz = np.asarray(pz, float)
    d = polyline_dist(px.ravel(), pz.ravel(), np.vstack([poly, poly[:1]])).reshape(px.shape)
    return np.where(inside_poly(px, pz, poly), -d, d)
def lid_paint_band(tag, px, pz, flick_on=True):
    """Width of the painted upper lid line beyond the outline (as in paint_head)."""
    ol = open_pts[tag]; s = EYE[tag]['s']
    ocx = 0.5 * (ol[:, 0].min() + ol[:, 0].max()); ocz = 0.5 * (ol[:, 2].min() + ol[:, 2].max())
    ang = np.arctan2(pz - ocz, s * (px - ocx))
    top = sstep(-0.05, 0.50, np.sin(ang))
    flick = np.exp(-((ang - 0.12) / 0.15) ** 2) * sstep(0.02, 0.10, s * (px - ocx))
    if not flick_on: flick = flick * 0
    lw = 0.0004 + 0.0080 * top ** 1.6 + 0.0045 * flick
    return np.where(np.maximum(sstep(0.0, 0.20, top), flick) > 0.02, lw, 0.0), ang
POLY = {t: open_pts[t][:, [0, 2]] for t in 'LR'}
def need_upper(tag, px, pz):
    band, ang = lid_paint_band(tag, px, pz, flick_on=False)
    # cover the painted line plus 3 mm, so the shell's tuck under the skin lands on plain fur
    return signed_poly(px, pz, POLY[tag]) - band - 0.0012 - 0.0030 * sstep(-0.1, 0.4, np.sin(ang))
def arch(tag, Q_T):
    """Leading edge of the lower lid at lidD = -0.24, in the front view: an upward arch."""
    pol = POLY[tag]; xc = 0.5 * (pol[:, 0].min() + pol[:, 0].max()); half = 0.5 * np.ptp(pol[:, 0])
    return xc, half
TH_HAPPY_U, TH_HAPPY_D = 0.488, -0.24       # the game's happy squint (0.4 x 1.22) and its lower lid
HAPPY = {}
for _t in 'LR':
    _pol = POLY[_t]; _xc = 0.5 * (_pol[:, 0].min() + _pol[:, 0].max()); _half = 0.5 * np.ptp(_pol[:, 0])
    _zz = _pol[:, 1][np.abs(_pol[:, 0] - _xc) < 0.004]
    HAPPY[_t] = (_xc, _half, _zz.max() - 0.28 * (_zz.max() - _zz.min()), EYE[_t]['s'])
OUTLINE_TB = {}
for _t in 'LR':
    _pol = POLY[_t]; _gx = np.linspace(_pol[:, 0].min(), _pol[:, 0].max(), 241); _tb = []
    for _x in _gx:
        _z = np.linspace(_pol[:, 1].min() - 0.002, _pol[:, 1].max() + 0.002, 801)
        _in = inside_poly(np.full_like(_z, _x), _z, _pol)
        _tb.append((_z[_in].max(), _z[_in].min()) if _in.any() else (np.nan, np.nan))
    _tb = np.array(_tb); _ok = np.isfinite(_tb[:, 0])
    OUTLINE_TB[_t] = (_gx[_ok], _tb[_ok, 0], _tb[_ok, 1])
def happy_edge(tag, px):
    """Upper-lid edge limit at +0.488: the top 28% at the centre, a gentle convex-down arc rising toward both corners and
    a little more toward the outer one (never sloping down outward). The main shell's leading edge never goes lower."""
    xc, half, zc, s = HAPPY[tag]
    u = (np.asarray(px) - xc) / half; uo = np.maximum(0.0, s * u)
    level = zc + 0.0015 * u ** 2 + 0.0015 * uo ** 2          # nearly level, a touch higher toward the outer corner
    gx_, zt_, zb_ = OUTLINE_TB[tag]
    zt = np.interp(px, gx_, zt_); zb = np.interp(px, gx_, zb_)
    return np.minimum(level, zt - 0.22 * (zt - zb))           # always covers the top of each column: no corner slivers
LOWER_EDGE = {}
def need_lower(tag, px, pz):
    xc, half, zc_e, dz_arch = LOWER_EDGE[tag]
    edge = zc_e - dz_arch * ((px - xc) / half) ** 2
    return np.maximum(signed_poly(px, pz, POLY[tag]), pz - edge)

def fit_lid(tag, kind, Q, NC, below, inner_rows, above, theta_T, hidden, g=0.0009, t_tuck=0.0025, m=0.0015,
            partial=(), gp=0.0007, raise_lead=False, hide_happy=False, mh=0.0012):
    """Rigid lid shell about the pivot axis (x, Q). Grid in the target frame; per point a radius rho with
    lower bounds (in front of the visible surface where it must cover: at the target pose over the needed region,
    and at the partial poses wherever it is over the eye opening) and upper bounds (under the skin, with margin m,
    at the hidden poses; tucked parts at every pose). Failures = lower bound above upper bound."""
    s = EYE[tag]['s']; x_eye = EYE_C[tag][0]
    need = need_upper if kind == 'U' else need_lower
    gx = np.linspace(x_eye - 0.09, x_eye + 0.09, 361); gz = np.linspace(EYE_C[tag][2] - 0.09, EYE_C[tag][2] + 0.12, 421)
    GX, GZ = np.meshgrid(gx, gz)
    nd = need(tag, GX, GZ) < 0
    xs_need = GX[nd]; x_lo, x_hi = xs_need.min(), xs_need.max()
    xs = np.linspace(x_lo - 0.005, x_hi + 0.005, NC)
    a_fine = np.linspace(-1.5, 1.5, 601)
    lo_hi = []
    for x in xs:
        Sx = np.array([ray_S(float(x), Q[0], Q[1], float(a)) for a in a_fine])
        pz = Q[1] + Sx * np.sin(a_fine)
        nmask = need(tag, np.full_like(pz, x), pz) < 0
        lo_hi.append((a_fine[nmask].min(), a_fine[nmask].max(), float(np.median(Sx[nmask]))) if nmask.any() else None)
    valid = [i for i, v in enumerate(lo_hi) if v is not None]
    for i in range(NC):
        if lo_hi[i] is None:
            j = min(valid, key=lambda v: abs(v - i)); lo, hi, r = lo_hi[j]; mid = 0.5 * (lo + hi); lo_hi[i] = (mid, mid, r)
    AA = []; LO_RIM = []; LO_A = []
    for i, (lo, hi, r) in enumerate(lo_hi):
        loA = lo
        if raise_lead:
            # at +0.488 the leading edge must not reach below the target arc: raise it (closed frame) where it would
            Sx = np.array([ray_S(float(xs[i]), Q[0], Q[1], float(a)) for a in a_fine])
            zf = Q[1] + Sx * np.sin(a_fine); ze = float(happy_edge(tag, xs[i]))
            k_ = np.where((zf[:-1] - ze) * (zf[1:] - ze) <= 0)[0]
            if len(k_):
                aE = a_fine[k_[0]] - (theta_T - TH_HAPPY_U)
                loA = min(max(lo, aE), hi - 0.02)
        LO_RIM.append(lo); LO_A.append(loA)
        rows = [loA + d / r for d in below] + (list(np.linspace(loA, hi, inner_rows + 2)[1:-1]) if hi > loA else [loA] * inner_rows)
        AA.append(sorted(rows + [hi + d / r for d in above]))
    AA = np.array(AA); LO_RIM = np.array(LO_RIM); LO_A = np.array(LO_A)
    X = np.repeat(xs[:, None], AA.shape[1], 1)
    S_T = S_vec(xs, Q, AA)
    PZ = Q[1] + S_T * np.sin(AA)
    dcov = need(tag, X, PZ)
    cov = 1 - sstep(-0.0008, 0.0030, dcov)
    LB = np.where(cov > 0.02, S_T + g * cov - t_tuck * (1 - cov), -np.inf)
    if raise_lead: LB = np.where(AA >= LO_A[:, None] - 1e-9, LB, -np.inf)   # below the raised edge: the filler's job
    below_lead = (AA < LO_A[:, None] - 1e-9) if raise_lead else np.zeros(X.shape, bool)
    lead_ok = np.zeros(X.shape, bool); lead_ok[:, len(below) - 1:] = True     # from the leading-edge row upward
    vis_partial = np.zeros(X.shape, bool)
    for th in partial:
        A_p = AA + theta_T - th; S_p = S_vec(xs, Q, A_p)
        zp = Q[1] + S_p * np.sin(A_p)
        over = (signed_poly(X, zp, POLY[tag]) < -0.0012) & lead_ok
        LB = np.where(over, np.maximum(LB, S_p + gp), LB); vis_partial |= over
    UB = np.full(X.shape, np.inf)
    hap_hide = np.zeros(X.shape, bool)
    if hide_happy:
        A_h = AA + theta_T - TH_HAPPY_U; S_h = S_vec(xs, Q, A_h); zh = Q[1] + S_h * np.sin(A_h)
        hap_hide = (signed_poly(X, zh, POLY[tag]) > 0.0008) | below_lead
        UB = np.where(hap_hide, np.minimum(UB, S_h - mh), UB)
    for th in hidden:
        UB = np.minimum(UB, S_vec(xs, Q, AA + theta_T - th) - m)
    tucked = (cov < 0.5) & ~vis_partial
    for th in np.linspace(min(0.0, theta_T), max(0.0, theta_T), 7):
        UB = np.where(tucked, np.minimum(UB, S_vec(xs, Q, AA + theta_T - th) - m), UB)
    rho = np.where(np.isfinite(LB), LB, S_T - t_tuck)
    bad = rho > UB
    rho = np.minimum(rho, UB)
    conflict = np.isfinite(LB) & (LB > UB) & ((dcov < -0.0006) | vis_partial)
    fails = int(conflict.sum())
    fl = np.argwhere(conflict)
    fail_info = [(round(float(X[i, j]), 4), round(float(PZ[i, j]), 4), int(j), round(float(UB[i, j] - LB[i, j]), 4)) for i, j in fl]
    PT = np.stack([X, Q[0] - rho * np.cos(AA), Q[1] + rho * np.sin(AA)], -1)
    part = None
    if theta_T > 0:                                       # upper lid at +0.4: covered fraction of the opening height
        pol = POLY[tag]; fr = []
        for i in range(NC):
            x = xs[i]; zz = pol[:, 1][np.abs(pol[:, 0] - x) < 0.006]
            if len(zz) < 2 or abs(x - pol[:, 0].mean()) > 0.35 * np.ptp(pol[:, 0]): continue
            ztop, zbot = zz.max(), zz.min()
            A4 = AA[i] + theta_T - TH_HAPPY_U
            S_p = np.array([ray_S(float(x), Q[0], Q[1], float(a)) for a in A4])
            vis = rho[i] > S_p + 0.0002
            zv = Q[1] + rho[i] * np.sin(A4)
            zl = zv[vis].min() if vis.any() else ztop
            fr.append(np.clip((ztop - zl) / (ztop - zbot), 0, 1))
        part = float(np.mean(fr)) if fr else 0.0
    return dict(PT=PT, cov=cov, dcov=dcov, fails=fails, fail_info=fail_info, part=part,
                needed=int((dcov < -0.0006).sum()), xs=xs, AA=AA, rho=rho, S_T=S_T, UB=UB, LO_RIM=LO_RIM, LO_A=LO_A,
                lo_hi=lo_hi)

def rot_x_about(Pts, Q, ang):
    c, s_ = math.cos(ang), math.sin(ang)
    y = Pts[..., 1] - Q[0]; z = Pts[..., 2] - Q[1]
    out = Pts.copy(); out[..., 1] = Q[0] + y * c - z * s_; out[..., 2] = Q[1] + y * s_ + z * c
    return out

def fit_filler(tag, Q, FA, ov=0.0045, gB=0.0026, m=0.0010, mh=0.0015, t_tuck=0.0025):
    """Small second shell on lidU: closes the outer-bottom wedge under the main shell's raised leading edge at +1.22
    (in front of the main shell, over its edge band), hidden at rest and at the +0.488 squint."""
    xs, lor, loa = FA['xs'], FA['LO_RIM'], FA['LO_A']
    idx = np.where(loa - lor > 0.004)[0]
    if len(idx) == 0: return None
    i0, i1 = max(0, idx[0] - 1), min(len(xs) - 1, idx[-1] + 1)
    cols = np.arange(i0, i1 + 1); xsB = xs[cols]; rr = np.array([FA['lo_hi'][i][2] for i in cols])
    AA = []
    for i, r in zip(cols, rr):
        lo = lor[i]; hiB = max(loa[i] + ov / r, lo + 0.004)
        AA.append([lo - 0.0070 / r, lo - 0.0025 / r, lo + 0.0012 / r] + list(np.linspace(lo, hiB, 5)[1:-1]) + [hiB, hiB + 0.0025 / r])
    AA = np.array(AA); X = np.repeat(xsB[:, None], AA.shape[1], 1)
    S_T = S_vec(xsB, Q, AA); PZ = Q[1] + S_T * np.sin(AA)
    inside = signed_poly(X, PZ, POLY[tag]) < 0.0012
    cover = inside & (AA >= lor[cols][:, None] - 1e-9) & (AA <= (loa[cols] + ov / rr)[:, None] + 1e-9)
    LB = np.where(cover, S_T + gB, -np.inf)
    UB = S_vec(xsB, Q, AA + 1.22) - m                                 # rest
    UB = np.minimum(UB, S_vec(xsB, Q, AA + 1.22 - TH_HAPPY_U) - mh)   # happy squint
    for th in np.linspace(0.0, 1.22, 7):                             # tucked rows: hidden all the way
        UB = np.where(~cover, np.minimum(UB, S_vec(xsB, Q, AA + 1.22 - th) - m), UB)
    rho = np.where(np.isfinite(LB), LB, S_T - t_tuck)
    fails = int((np.isfinite(LB) & (LB > UB)).sum())
    rho = np.minimum(rho, UB)
    PT = np.stack([X, Q[0] - rho * np.cos(AA), Q[1] + rho * np.sin(AA)], -1)
    return dict(PT=PT, xs=xsB, AA=AA, rho=rho, UB=UB, S_T=S_T, fails=fails, LO_RIM=lor[cols], LO_A=loa[cols],
                cover=cover, part=None, needed=int(cover.sum()), fail_info=[], cols=cols)
LIDS = {}
for tag in 'LR':
    s = EYE[tag]['s']; c = EYE_C[tag]; n = EYE[tag]['n']
    back = nrm(np.array([0, -n[1], -n[2]]))           # "behind the eye" in the y-z plane
    cands = [(kq_, kz_) for kq_ in (-0.003, 0.010) for kz_ in (-0.030, -0.026, -0.018)]
    if tag == 'R': cands = [tuple(LIDS['lidU_L']['depth'])]          # mirror the left eye's pivot
    best = None
    for kq_, kz_ in cands:
        Q_ = (c[1] + kq_ * back[1], c[2] + kq_ * back[2] + kz_)
        F_ = fit_lid(tag, 'U', Q_, 18, [-0.0060, -0.0012, 0.0010], 5, [0.0030, 0.0080], 1.22, [0.0], m=0.0010,
                     g=0.0014, partial=(0.2, 0.3, 0.35, 0.4, 0.45, 0.488, 0.5, 0.6, 0.8, 1.0), gp=0.0020, raise_lead=True, hide_happy=True)
        print('UFIT', tag, kq_, kz_, F_['fails'], round(F_['part'], 3), F_['fail_info'][:3], flush=True)
        if best is None or F_['fails'] < best[1]['fails']: best = ((kq_, kz_), F_, Q_)
    kq, FU, QU = best
    LIDS['lidU_' + tag] = dict(F=FU, Q=QU, theta=1.22, depth=list(kq))
    # lower lid: pivot deep along the inward normal at the bottom rim, arm length chosen for ~1/4 coverage
    ol = open_pts[tag]; rim = ol[np.argmin(ol[:, 2])]
    nr = nrm(np.array([0.0, rim[1] - c[1], rim[2] - c[2]]))
    bestD = None
    for L in (0.26, 0.28, 0.30, 0.32, 0.34, 0.36):
        QD = (rim[1] - L * nr[1], rim[2] - L * nr[2])
        rimT = rot_x_about(rim[None].copy(), QD, -0.14)[0]   # neutral (-0.10) -> squint (-0.24)
        dz = rimT[2] - rim[2]
        xc, half = arch(tag, QD)
        LOWER_EDGE[tag] = (xc, half, rim[2] + dz - 0.0012, 0.70 * dz)
        FD = fit_lid(tag, 'D', QD, 14, [-0.0100, -0.0050, -0.0015], 4, [0.0008, 0.0030, 0.0060], -0.24, [0.0, -0.10],
                     m=0.0010, g=0.0013)
        print('DFIT', tag, L, FD['fails'], FD['fail_info'][:3], flush=True)
        cover = (dz - 0.0012) / np.ptp(ol[:, 2])
        score = FD['fails'] + 200 * max(0, 0.31 - cover)
        if bestD is None or score < bestD[0]: bestD = (score, L, FD, QD, dict(LOWER_EDGE[tag]) if False else LOWER_EDGE[tag], cover)
        if FD['fails'] == 0 and cover >= 0.31: break
    _, L, FD, QD, edge, cover = bestD
    LOWER_EDGE[tag] = edge
    LIDS['lidD_' + tag] = dict(F=FD, Q=QD, theta=-0.24, arm=L, cover_fraction=cover)
    FF = fit_filler(tag, QU, FU)
    if FF is not None:
        LIDS['lidF_' + tag] = dict(F=FF, Q=QU, theta=1.22, filler=True)
        print('FFIT', tag, FF['fails'], 'cols', len(FF['xs']), flush=True)
    P['lidU_' + tag] = (c[0], QU[0], QU[1])
    P['lidD_' + tag] = (c[0], QD[0], QD[1])
# ---- refinement with real view rays (front and both 45 deg game cameras) in the target pose
VIEW_DIRS = [Vector((0, 1, 0))]
HIDE_DIRS = []
for yaw, el in ((45, 45), (-45, 45), (35, 8), (-35, 8), (0, 0), (90, 10), (-90, 10), (0, 60)):
    e_, y_ = math.radians(el), math.radians(yaw)
    HIDE_DIRS.append(-Vector((math.sin(y_) * math.cos(e_), -math.cos(y_) * math.cos(e_), math.sin(e_))))
for yaw in (45, -45):
    e_, y_ = math.radians(45), math.radians(yaw)
    VIEW_DIRS.append(-Vector((math.sin(y_) * math.cos(e_), -math.cos(y_) * math.cos(e_), math.sin(e_))))
def grid_tris(nI, nJ):
    out = []
    for i in range(nI - 1):
        for j in range(nJ - 1):
            a, b, c_, d_ = i * nJ + j, (i + 1) * nJ + j, (i + 1) * nJ + j + 1, i * nJ + j + 1
            out += [(a, b, c_), (a, c_, d_)]
    return out
def lid_hidden_poses(name):
    if name.startswith('lidU'): return [0.0]
    if name.startswith('lidF'): return [0.0, TH_HAPPY_U]
    return [0.0, -0.10]
def lead_edge_z(F, Q, row):
    """Front-view z of a shell row in its target pose, per column (for splitting coverage between the shells)."""
    return F['xs'], F['PT'][:, row, 2]
def refine_lid(name, passes=10):
    L_ = LIDS[name]; F = L_['F']; tag = name[-1]; Q = L_['Q']
    need = need_upper if name[:4] in ('lidU', 'lidF') else need_lower
    xs, AA, rho, UB = F['xs'], F['AA'], F['rho'].copy(), F['UB'].copy()
    vdirs = VIEW_DIRS if name[:4] in ('lidU', 'lidF') else VIEW_DIRS[:1]
    nI, nJ = AA.shape; tris = grid_tris(nI, nJ)
    x_e = EYE_C[tag][0]
    gx = np.linspace(x_e - 0.08, x_e + 0.08, 161); gz = np.linspace(EYE_C[tag][2] - 0.08, EYE_C[tag][2] + 0.10, 181)
    GX, GZ = np.meshgrid(gx, gz); sel = need(tag, GX, GZ) < -0.0008
    if name[:4] in ('lidU', 'lidF') and ('lidF_' + tag) in LIDS:
        FA = LIDS['lidU_' + tag]['F']; zA = np.interp(GX, FA['xs'], FA['PT'][:, 2, 2])     # main shell's leading row
        FB = LIDS['lidF_' + tag]['F']; inB = (GX >= FB['xs'].min()) & (GX <= FB['xs'].max())
        if name.startswith('lidU'): sel &= ~(inB & (GZ < zA + 0.0015))       # the filler covers below the raised edge
        else: sel &= inB & (GZ < zA + 0.0030) & (signed_poly(GX, GZ, POLY[tag]) < -0.0008)
    samples = list(zip(GX[sel], GZ[sel]))
    hap_samples = []
    if name.startswith('lidU'):                      # happy: the eye above the target edge is covered (front, 45 deg yaws)
        selh = (signed_poly(GX, GZ, POLY[tag]) < -0.0025) & (GZ > happy_edge(tag, GX) + 0.0020)
        S_cap = S_vec(xs, Q, AA + L_['theta'] - TH_HAPPY_U) + 0.0030      # never float > 3 mm in front at happy
        hap_samples = list(zip(GX[selh], GZ[selh]))
    hap_miss = 0
    misses = 0
    for it in range(passes):
        X = np.repeat(xs[:, None], nJ, 1)
        PT = np.stack([X, Q[0] - rho * np.cos(AA), Q[1] + rho * np.sin(AA)], -1)
        flat = PT.reshape(-1, 3); lid_bvh = BVHTree.FromPolygons([Vector(p_) for p_ in flat], tris)
        bump = np.zeros_like(rho); misses = 0
        for vd in vdirs:
            for (sx_, sz_) in samples:
                # the visible surface point at (sx, sz) seen along vd: aim the ray through the skin hit
                org = Vector((sx_, -1.0, sz_)); hs = BVH_U.ray_cast(org, Vector((0, 1, 0)), 3)[0]
                if hs is None: continue
                o2 = hs - vd * 0.5
                hu = BVH_U.ray_cast(o2, vd, 1.0); hl = lid_bvh.ray_cast(o2, vd, 1.0)
                if hl[0] is not None and hl[3] < hu[3] - 0.0002: continue
                misses += 1
                d2 = (flat[:, 0] - hs.x) ** 2 + (flat[:, 2] - hs.z) ** 2
                k_ = int(np.argmin(d2)); i_, j_ = divmod(k_, nJ)
                for di in (-1, 0, 1):
                    for dj in (-1, 0, 1):
                        ii, jj = i_ + di, j_ + dj
                        if 0 <= ii < nI and 0 <= jj < nJ:
                            bump[ii, jj] = max(bump[ii, jj], 0.0008 if (di or dj) else 0.0012)
        rho = np.minimum(rho + bump, UB)
        # hidden poses: any lid vertex seen from a camera direction (no skin in front of it) moves inward
        shown = 0; push = np.zeros_like(rho)
        for th in lid_hidden_poses(name):
            PH = rot_x_about(np.stack([X, Q[0] - rho * np.cos(AA), Q[1] + rho * np.sin(AA)], -1), Q, th - L_['theta'])
            for i_ in range(nI - 1):
                for j_ in range(nJ - 1):
                    c4 = PH[i_:i_ + 2, j_:j_ + 2].reshape(4, 3)
                    pts = list(c4) + [c4.mean(0)] + [0.5 * (c4[k1] + c4[k2]) for k1, k2 in ((0, 1), (0, 2), (1, 3), (2, 3))]
                    hit_any = False
                    for p_ in pts:
                        v_ = Vector(p_)
                        for vd in HIDE_DIRS:
                            if BVH_U.ray_cast(v_ - vd * 0.5, vd, 0.5 - 0.0003)[0] is None: hit_any = True; break
                        if hit_any: break
                    if hit_any:
                        push[i_:i_ + 2, j_:j_ + 2] = 0.0008; shown += 1
        if name.startswith('lidU') and hap_samples:
            PHh = rot_x_about(np.stack([X, Q[0] - rho * np.cos(AA), Q[1] + rho * np.sin(AA)], -1), Q, TH_HAPPY_U - L_['theta'])
            flat_h = PHh.reshape(-1, 3); bvh_h = BVHTree.FromPolygons([Vector(p_) for p_ in flat_h], tris)
            bump_h = np.zeros_like(rho); hap_miss = 0
            for vd in VIEW_DIRS:
                for (sx_, sz_) in hap_samples:
                    hs = BVH_U.ray_cast(Vector((sx_, -1.0, sz_)), Vector((0, 1, 0)), 3)[0]
                    if hs is None: continue
                    o2 = hs - vd * 0.5; hu = BVH_U.ray_cast(o2, vd, 1.0); hl = bvh_h.ray_cast(o2, vd, 1.0)
                    if hl[0] is not None and hl[3] < hu[3] - 0.0002: continue
                    hap_miss += 1
                    k_ = int(np.argmin((flat_h[:, 0] - hs.x) ** 2 + (flat_h[:, 2] - hs.z) ** 2)); i_, j_ = divmod(k_, nJ)
                    for di in (-1, 0, 1):
                        for dj in (-1, 0, 1):
                            ii, jj = i_ + di, j_ + dj
                            if 0 <= ii < nI and 0 <= jj < nJ: bump_h[ii, jj] = max(bump_h[ii, jj], 0.0004 if (di or dj) else 0.0006)
            rho = np.minimum(np.maximum(rho, np.minimum(rho + bump_h, S_cap)), UB)
        if name[:4] in ('lidU', 'lidF'):
            PHh = rot_x_about(np.stack([X, Q[0] - rho * np.cos(AA), Q[1] + rho * np.sin(AA)], -1), Q, TH_HAPPY_U - L_['theta'])
            PTb = np.stack([X, Q[0] - rho * np.cos(AA), Q[1] + rho * np.sin(AA)], -1)
            for i_ in range(nI - 1):
                for j_ in range(nJ - 1):
                    c4 = PHh[i_:i_ + 2, j_:j_ + 2].reshape(4, 3); cen = c4.mean(0)
                    if signed_poly(np.array([cen[0]]), np.array([cen[2]]), POLY[tag])[0] < 0.0010: continue
                    b4 = PTb[i_:i_ + 2, j_:j_ + 2].reshape(4, 3)            # the same quad when closed
                    if (need_upper(tag, b4[:, 0], b4[:, 2]) < 0.0015).any(): continue
                    pts = list(c4) + [cen] + [0.5 * (c4[k1] + c4[k2]) for k1, k2 in ((0, 1), (0, 2), (1, 3), (2, 3))]
                    if any(BVH_U.ray_cast(Vector(p_) - vd * 0.5, vd, 0.5 - 0.0003)[0] is None for p_ in pts for vd in HIDE_DIRS):
                        push[i_:i_ + 2, j_:j_ + 2] = 0.0008; shown += 1
        rho = rho - push
        UB = np.where(push > 0, np.minimum(UB, rho), UB)        # hidden wins over coverage
        F['shown_at_rest'] = shown
        F['happy_misses'] = hap_miss
        if misses == 0 and shown == 0 and hap_miss == 0: break
    X = np.repeat(xs[:, None], nJ, 1)
    F['PT'] = np.stack([X, Q[0] - rho * np.cos(AA), Q[1] + rho * np.sin(AA)], -1); F['rho'] = rho
    F['view_misses'] = misses; F['view_samples'] = len(samples) * len(vdirs)
for name in list(LIDS): refine_lid(name)
for k_, v in LIDS.items():
    STATS[k_] = {'happy_view_ray_misses': v['F'].get('happy_misses'), 'view_ray_misses': v['F']['view_misses'], 'view_ray_samples': v['F']['view_samples'], 'vertices_visible_at_hidden_poses': v['F']['shown_at_rest'],'pivot_yz': [round(v['Q'][0], 4), round(v['Q'][1], 4)], 'target': v['theta'], 'happy_cover_at_0.488': v['F']['part'],
                 'needed_samples': v['F']['needed'], 'uncovered_samples': v['F']['fails'],
                 **({'pivot_depth_behind_eye_centre_m': v['depth']} if 'depth' in v else ({'filler_for': 'lidU_' + k_[-1]} if v.get('filler') else {'arm_m': v['arm'], 'cover_fraction': round(v['cover_fraction'], 3)}))}
print('LID_FIT', json.dumps(STATS), flush=True)
with open(os.path.join(ROOT, 'scratch', 'open_pts.json'), 'w') as _f: json.dump({t: open_pts[t][:, [0, 2]].tolist() for t in 'LR'}, _f)

# ================================================================== 4. atlas: lid charts, mouth and tongue patches
# The eyeballs' buried backs (polar angle > 106 deg) are remapped to a white texel; their chart rows are reused.
atlas = ns['atlas_u8'].copy()
def chart_rect(chart, u0, u1, v0, v1):
    x, y, w, h = CHARTS[chart]
    return (int(x + G + u0 * (w - 2 * G)), int(x + G + u1 * (w - 2 * G)), int(y + G + v0 * (h - 2 * G)), int(y + G + v1 * (h - 2 * G)))
RECTS = {'lidU_L': chart_rect('eye.L', 0.00, 0.40, 0.79, 0.995), 'lidD_L': chart_rect('eye.L', 0.42, 0.64, 0.79, 0.995),
         'lidU_R': chart_rect('eye.R', 0.00, 0.40, 0.79, 0.995), 'lidD_R': chart_rect('eye.R', 0.42, 0.64, 0.79, 0.995),
         'lidF_L': chart_rect('eye.L', 0.66, 0.80, 0.79, 0.995), 'lidF_R': chart_rect('eye.R', 0.66, 0.80, 0.79, 0.995),
         'mouth': chart_rect('eye.L', 0.83, 0.90, 0.79, 0.995), 'tongue': chart_rect('eye.L', 0.92, 0.995, 0.79, 0.995)}
WHITE_UV = ns['atlas_uv']('eye.L', 0.5, 0.70)
for t in 'LR':
    eme = eyes[t].data; ch = 'eye.' + t; x0, y0, w0, h0 = CHARTS[ch]
    for poly in eme.polygons:
        vv = [(eme.uv_layers.active.data[li].uv.y * 2048 - y0 - G) / (h0 - 2 * G) for li in poly.loop_indices]
        if min(vv) >= 0.749:
            for li in poly.loop_indices: eme.uv_layers.active.data[li].uv = WHITE_UV
def grid_bilinear(Gd, fi, fj):
    nI, nJ = Gd.shape[0] - 1, Gd.shape[1] - 1
    fi = np.clip(fi, 0, nI - 1e-6); fj = np.clip(fj, 0, nJ - 1e-6); i0 = fi.astype(int); j0 = fj.astype(int)
    ti = (fi - i0)[..., None]; tj = (fj - j0)[..., None]
    a = Gd[i0, j0] * (1 - tj) + Gd[i0, j0 + 1] * tj; b = Gd[i0 + 1, j0] * (1 - tj) + Gd[i0 + 1, j0 + 1] * tj
    return a * (1 - ti) + b * ti
def grid_normals(PT, Q):
    du = np.gradient(PT, axis=0); dv = np.gradient(PT, axis=1); nn = np.cross(du, dv)
    nn /= np.maximum(np.linalg.norm(nn, axis=-1, keepdims=True), 1e-12)
    out = PT - np.array([PT[..., 0].mean(), Q[0], Q[1]])[None, None]; out[..., 0] = 0
    nn[(nn * out).sum(-1) < 0] *= -1
    return nn
def paint_lid(name):
    L_ = LIDS[name]; F = L_['F']; tag = name[-1]; PT = F['PT']; NN = grid_normals(PT, L_['Q'])
    x0, x1, y0, y1 = RECTS[name]
    U, V = np.meshgrid(np.linspace(0, 1, x1 - x0), np.linspace(0, 1, y1 - y0))
    fi = U * (PT.shape[0] - 1); fj = V * (PT.shape[1] - 1)
    p = grid_bilinear(PT, fi, fj); n = grid_bilinear(NN, fi, fj); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    C = mix(fur_colour(n), white_colour(n), head_white_mask(p))
    if name[:4] in ('lidU', 'lidF'):
        AAf = grid_bilinear(F['AA'][..., None], fi, fj)[..., 0]; rhof = grid_bilinear(F['rho'][..., None], fi, fj)[..., 0]
        lead = np.interp(p[..., 0], F['xs'], F['LO_A'] if name.startswith('lidU') else F['LO_RIM'])
        d_lead = (AAf - lead) * rhof                          # metres along the shell from its leading edge
        lash = sstep(-0.0016, -0.0006, d_lead) * (1 - sstep(0.0028, 0.0036, d_lead))
        if name.startswith('lidU'):                           # the main shell's ends tuck away: fade the band there
            ds = signed_poly(p[..., 0], p[..., 2], POLY[tag]); lash *= 1 - sstep(0.004, 0.010, ds)
            gap = (np.interp(p[..., 0], F['xs'], F['LO_A']) - np.interp(p[..., 0], F['xs'], F['LO_RIM'])) * rhof
            lash *= 1 - sstep(0.0008, 0.0020, gap)            # covered by the filler shell, whose lash continues it
        C = mix(C, rgb('lid'), lash)
    else:
        xc, half, zc_e, dza = LOWER_EDGE[tag]
        edge = zc_e - dza * ((p[..., 0] - xc) / half) ** 2
        line = (1 - sstep(0.0016, 0.0024, np.abs(p[..., 2] - edge + 0.0012))) * (signed_poly(p[..., 0], p[..., 2], POLY[tag]) < 0.0015)
        C = mix(C, rgb('lid'), line)
    atlas[y0:y1, x0:x1] = np.round(np.clip(C, 0, 1) * 255).astype(np.uint8)
    return (x0, x1, y0, y1)
for nm_ in LIDS: paint_lid(nm_)
x0, x1, y0, y1 = RECTS['mouth']; atlas[y0:y1, x0:x1] = np.round(rgb('#4a1c1c') * 255).astype(np.uint8)
x0, x1, y0, y1 = RECTS['tongue']
Vt = np.linspace(0, 1, y1 - y0)[:, None, None]
atlas[y0:y1, x0:x1] = np.round(np.clip(mix(rgb('#e07a86'), rgb('#c85c6c'), np.broadcast_to(Vt[..., 0], (y1 - y0, x1 - x0)) * 0.8), 0, 1) * 255).astype(np.uint8)
def rect_uv(name, u, v):
    x0, x1, y0, y1 = RECTS[name]
    return ((x0 + 1.5 + u * (x1 - x0 - 3)) / 2048, (y0 + 1.5 + v * (y1 - y0 - 3)) / 2048)
def png_chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
rig_atlas = os.path.join(ROOT, 'shadow-toy_rig_atlas.png')
raw = b''.join(b'\x00' + r.tobytes() for r in atlas[::-1])
with open(rig_atlas, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', 2048, 2048, 8, 2, 0, 0, 0)) +
            png_chunk(b'IDAT', zlib.compress(raw, 9)) + png_chunk(b'IEND', b''))
img = bpy.data.images.load(rig_atlas); img.name = 'Shadow_toy_rig_atlas_2048'; img.pack()
for node in mat.node_tree.nodes:
    if node.type == 'TEX_IMAGE': node.image = img

def make_mesh(name, coords, polys, uvs):
    m_ = bpy.data.meshes.new(name); m_.from_pydata([tuple(c_) for c_ in coords], [], polys); m_.update()
    layer = m_.uv_layers.new(name='Atlas')
    for poly, uu in zip(m_.polygons, uvs):
        poly.use_smooth = True
        for li, u in zip(poly.loop_indices, uu): layer.data[li].uv = u
    m_.materials.append(mat)
    ob = bpy.data.objects.new(name, m_); bpy.context.collection.objects.link(ob)
    return ob
def grid_mesh(name, PT, chart, outward_ref):
    nI, nJ = PT.shape[0], PT.shape[1]
    coords = PT.reshape(-1, 3); polys = []; uvs = []
    for i in range(nI - 1):
        for j in range(nJ - 1):
            q = [i * nJ + j, (i + 1) * nJ + j, (i + 1) * nJ + j + 1, i * nJ + j + 1]
            polys.append(q); uvs.append([rect_uv(chart, (ii) / (nI - 1), (jj) / (nJ - 1)) for ii, jj in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))])
    a0, b0, c0 = coords[polys[0][0]], coords[polys[0][1]], coords[polys[0][2]]
    nn = np.cross(b0 - a0, c0 - a0); cen = coords[polys[0]].mean(0)
    if np.dot(nn, cen - outward_ref) < 0:
        polys = [p_[::-1] for p_ in polys]; uvs = [u_[::-1] for u_ in uvs]
    return make_mesh(name, coords, polys, uvs)
lid_objs = {}
for name, L_ in LIDS.items():
    PR = rot_x_about(L_['F']['PT'], L_['Q'], -L_['theta'])      # rest pose positions
    ref = np.array([L_['F']['PT'][..., 0].mean(), L_['Q'][0], L_['Q'][1]])
    ref_r = np.array([ref[0], ref[1], ref[2]])
    lid_objs[name] = grid_mesh('Shadow_' + name, PR, name, ref_r)

# ================================================================== 5. mouth pocket and tongue
RIM = [np.array(p_) for p_ in RIM]
nR = len(RIM); D0 = 0.046; DN = 3
xr = np.array([p_[0] for p_ in RIM]); prof = np.sqrt(np.clip(1 - (xr / max(abs(xr[0]), abs(xr[-1]))) ** 2, 0, 1))
coarse = np.unique(np.round(np.linspace(0, nR - 1, 15)).astype(int))
def ring_point(i_c, j, up):
    p_ = RIM[i_c].copy(); f = prof[i_c]; sj = (j / DN) ** 0.85
    q = p_ + np.array([0, D0 * f * (j / DN), (0.020 if up else -0.034) * f * sj])
    for _ in range(12):                                   # keep inside the head with a margin
        if head_full(q[None])[0] < -0.0025 or j == 0: break
        q = p_ + (q - p_) * 0.85
    return q
coords, polys, puv, pw_src = [], [], [], []   # pw_src: (rim index, lower?) the weights source per vertex
def addv(p_, src_):
    coords.append(p_); pw_src.append(src_); return len(coords) - 1
sheet_ids = {}
for up in (True, False):
    rim_ids = [addv(RIM[i], (i, not up)) for i in range(nR)]
    rings = [[addv(ring_point(ic, j, up), (ic, not up)) for ic in coarse] for j in range(1, DN + 1)]
    sheet_ids[up] = (rim_ids, rings)
    # zipper between the fine rim and the first coarse ring
    r1 = rings[0]; i = 0; kk = 0
    while i < nR - 1 or kk < len(coarse) - 1:
        adv_rim = kk >= len(coarse) - 1 or (i < nR - 1 and RIM[i + 1][0] <= coords[r1[kk + 1]][0])
        if adv_rim: polys.append((rim_ids[i], rim_ids[i + 1], r1[kk])); i += 1
        else: polys.append((rim_ids[i], r1[kk + 1], r1[kk])); kk += 1
    for j in range(DN - 1):
        for kk in range(len(coarse) - 1):
            polys.append((rings[j][kk], rings[j][kk + 1], rings[j + 1][kk + 1], rings[j + 1][kk]))
ru, rl = sheet_ids[True][1][-1], sheet_ids[False][1][-1]
for kk in range(len(coarse) - 1): polys.append((ru[kk], ru[kk + 1], rl[kk + 1], rl[kk]))
tris = []
for p_ in polys:
    for kk in range(1, len(p_) - 1):
        a, b, c_ = p_[0], p_[kk], p_[kk + 1]
        if np.linalg.norm(np.cross(coords[b] - coords[a], coords[c_] - coords[a])) > 1e-11: tris.append((a, b, c_))
mouth = make_mesh('Shadow_mouth_pocket', coords, tris, [[rect_uv('mouth', .5, .5)] * 3 for _ in tris])
# orient the pocket's faces inward (toward the viewer looking into the mouth): normals point to the pocket's centre
bm = bmesh.new(); bm.from_mesh(mouth.data); bm.faces.ensure_lookup_table()
cen = Vector(tuple(np.mean(coords, 0)))
for f in bm.faces:
    if f.normal.dot(cen - f.calc_center_median()) < 0: f.normal_flip()
bm.to_mesh(mouth.data); bm.free()
rim_c = RIM[int(np.argmin(np.abs(xr)))]
TONGUE_C = rim_c + np.array([0, 0.036, -0.0135])
tc_, tr_ = 14, 8
T_ = np.radians(np.linspace(0, 180, tr_ + 1)); F_ = 2 * PI * np.arange(tc_) / tc_
tco, tpo, tuv = [], [], []
for j, th in enumerate(T_):
    for i, ph in enumerate(F_):
        if j in (0, tr_) and i > 0: continue
        st = math.sin(th)
        tco.append(TONGUE_C + np.array([0.029 * st * math.cos(ph), 0.026 * math.cos(th), 0.0068 * st * math.sin(ph)]))
def tid(j, i): return 0 if j == 0 else (len(tco) - 1 if j == tr_ else 1 + (j - 1) * tc_ + i % tc_)
for j in range(tr_):
    for i in range(tc_):
        q = [tid(j, i), tid(j + 1, i), tid(j + 1, i + 1), tid(j, i + 1)]
        q = [v for kk_, v in enumerate(q) if v not in q[:kk_]]
        tpo.append(q); tuv.append([rect_uv('tongue', .5, min(1, max(0, (tco[v][1] - TONGUE_C[1]) / 0.052 + .5))) for v in q])
tongue = make_mesh('Shadow_tongue', tco, tpo, tuv)
bm = bmesh.new(); bm.from_mesh(tongue.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(tongue.data); bm.free()
inside = [float(head_full(np.array(v)[None])[0]) for v in tco]
STATS['tongue_max_sdf'] = round(max(inside), 4)
pocket_in = [float(head_full(np.array(c_)[None])[0]) for c_ in coords]
STATS['pocket_rim_points'] = nR; STATS['pocket_inner_max_sdf'] = round(max(v for v, s_ in zip(pocket_in, pw_src) if True) if False else max(pocket_in[nR:]), 4)

# ================================================================== 6. armature
BONES = ['root', 'body', 'neck', 'head', 'jaw', 'eye_L', 'lidU_L', 'lidD_L', 'lip_L', 'ear_L', 'eye_R', 'lidU_R', 'lidD_R',
         'lip_R', 'ear_R', 'legFL', 'legFR', 'legBL', 'legBR', 'tail1', 'tail2']
PARENT = {'root': None, 'body': 'root', 'neck': 'body', 'head': 'neck', 'jaw': 'head', 'legFL': 'root', 'legFR': 'root',
          'legBL': 'root', 'legBR': 'root', 'tail1': 'body', 'tail2': 'tail1'}
for t in 'LR':
    PARENT.update({'eye_' + t: 'head', 'lidU_' + t: 'head', 'lidD_' + t: 'head', 'lip_' + t: 'head', 'ear_' + t: 'head'})
adata = bpy.data.armatures.new('Shadow_skeleton'); arm = bpy.data.objects.new('Shadow_Rig', adata)
bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in BONES:
    eb = adata.edit_bones.new(name); eb.head = Vector(P[name]); eb.tail = Vector(P[name]) + Vector((0, 0.03, 0)); eb.roll = 0
    if PARENT[name]: eb.parent = adata.edit_bones[PARENT[name]]
    eb.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for pb in arm.pose.bones: pb.rotation_mode = 'XYZ'

# ================================================================== 7. weights
def jaw_w(x, y, z, lower):
    if not lower: return 0.0
    ax = abs(x); dz = max(0.0, float(cut_z(min(ax, X_SEP))) - z)
    A = 1 - sm(X_SEP - 0.030 + 1.2 * dz, X_SEP + 1.2 * dz, ax)
    return A * (1 - sm(-0.135, -0.075, y))
def lip_w(x, y, z):
    return 0.9 * math.exp(-(((abs(x) - X_SEP) / 0.018) ** 2 + ((z - Z_CORNER) / 0.014) ** 2)) * (1 - sm(-0.17, -0.12, y))
def face_w(x, y, z, lower):
    L = lip_w(x, y, z); J = jaw_w(x, y, z, lower)
    return {'lip_' + ('L' if x >= 0 else 'R'): L, 'jaw': (1 - L) * J, 'head': (1 - L) * (1 - J)}
def neck_band(x, y, z):
    region = 1 - sm(0.02, 0.09, y)
    hs = (0.25 * sm(0.25, 0.30, z) + 0.75 * sm(0.305, 0.345, z)) * region
    nk = sm(0.22, 0.27, z) * region * (1 - hs)
    return {'head': hs, 'neck': nk}
def leg_w(x, y, z):
    out = {}
    for name, (x0, y0, front) in {'legFL': (FL[0], FL[1], 1), 'legFR': (-FL[0], FL[1], 1),
                                  'legBL': (HL[0], HL[1], 0), 'legBR': (-HL[0], HL[1], 0)}.items():
        if front:
            d = math.hypot(x - x0, y - y0); Hh = 1 - sm(0.062, 0.118, d); V = 1 - sm(0.118, 0.215, z)
        else:
            q = math.hypot((x - x0) / 0.072, (y - (y0 - 0.012)) / 0.095); Hh = 1 - sm(0.85, 1.55, q); V = 1 - sm(0.108, 0.215, z)
        Hh *= sm(0.0, 0.045, x * (1 if x0 > 0 else -1))      # never across the midline
        paw = 1 - sm(0.09, 0.115, z)
        w = V * (Hh + (1 - Hh) * paw * (1 - sm(0.06, 0.10, math.hypot(x - x0, y - y0))))
        if w > 1e-4: out[name] = w
    return out
def body_field(x, y, z):
    w = leg_w(x, y, z); w.update(neck_band(x, y, z))
    tot = sum(w.values())
    if tot > 1: w = {k: v / tot for k, v in w.items()}; tot = 1
    w['body'] = 1 - tot
    return w
def bind(o, weights):
    o.vertex_groups.clear(); groups = {}
    for vi, ww in enumerate(weights):
        pairs = sorted([(b, float(w)) for b, w in ww.items() if w > 1e-4], key=lambda t: -t[1])[:4]
        tot = sum(w for _, w in pairs); assert tot > 0, (o.name, vi)
        q = np.round(np.array([w / tot for _, w in pairs]) * 255).astype(int); q[0] += 255 - int(q.sum())
        for (b, _), qq in zip(pairs, q):
            if qq <= 0: continue
            if b not in groups: groups[b] = o.vertex_groups.new(name=b)
            groups[b].add([vi], int(qq) / 255, 'REPLACE')
    mod = o.modifiers.new('Game skin', 'ARMATURE'); mod.object = arm; mod.use_deform_preserve_volume = False
    o.parent = arm; o.matrix_parent_inverse = Matrix.Identity(4)
# head
hw = []
for v, inf in zip(head.data.vertices, vinfo):
    x, y, z = v.co
    if inf[2] == 'nose': hw.append({'head': 1.0}); continue
    hw.append(face_w(x, y, z, inf[1] == 'L'))
bind(head, hw)
# pocket: each vertex copies the weights of its rim point (upper sheet = upper lip, lower sheet = lower lip/jaw)
bind(mouth, [face_w(*RIM[i], low) for (i, low) in pw_src])
bind(tongue, [{'jaw': 1.0} for _ in tongue.data.vertices])
# eyes, lids
for t in 'LR':
    bind(eyes[t], [{'eye_' + t: 1.0} for _ in eyes[t].data.vertices])
for name, ob in lid_objs.items(): bind(ob, [{name.replace('lidF', 'lidU'): 1.0} for _ in ob.data.vertices])
# ears: planted base, whole-ear swing above it
for t, s in (('L', 1), ('R', -1)):
    base, up, fwd, side, Lr = ns['ear_frame'](s); hroot = ns['EAR_IN'] * Lr
    ew = []
    for v in ears[t].data.vertices:
        h = float(np.dot(np.array(v.co) - base, up)); e = sm(hroot - 0.010, hroot + 0.025, h)
        ew.append({'ear_' + t: e, 'head': 1 - e})
    bind(ears[t], ew)
# tail
tw = []
for v in tail.data.vertices:
    sx = float(np.dot(np.array(v.co) - TAIL_ROOT, TAIL_AX))
    wb = 1 - sm(-0.012, 0.010, sx); w2 = sm(0.018, 0.045, sx) * (1 - wb)
    tw.append({'body': wb, 'tail2': w2, 'tail1': 1 - wb - w2})
bind(tail, tw)
# body object: barrel + legs (one spatial field), collar (neck band), tag + ring (rigid with the collar front)
blab = labels['Shadow_body']
collar_front = ns['COLLAR_FRONT']
cf_w = neck_band(*collar_front); cf_w['body'] = 1 - sum(cf_w.values())
bw = []
for v, lb in zip(body.data.vertices, blab):
    x, y, z = v.co
    if lb in ('tag', 'tag_ring'): bw.append(dict(cf_w))
    elif lb == 'collar':
        w = neck_band(x, y, z); w['body'] = 1 - sum(w.values()); bw.append(w)
    else: bw.append(body_field(x, y, z))
bind(body, bw)

meshes = [head, body, ears['L'], ears['R'], eyes['L'], eyes['R'], tail, mouth, tongue] + list(lid_objs.values())
tri = 0
for o in meshes:
    o.data.calc_loop_triangles(); tri += len(o.data.loop_triangles)
    assert len(o.modifiers) == 1 and o.modifiers[0].type == 'ARMATURE'
    for v in o.data.vertices:
        assert 1 <= len(v.groups) <= 4 and abs(sum(g.weight for g in v.groups) - 1) < 2e-3, (o.name, v.index)
STATS['triangles'] = tri
print('RIG_TRIANGLES', tri, flush=True)
assert tri <= 28000, tri
arm.data.pose_position = 'POSE'
for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'shadow-toy_rig.blend'))
rig_info = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c_), 5) for c_ in P[b]]} for b in BONES],
            'axes': 'identity rest orientations: pose rotations are world-axis rotations about each bone head; game XYZ = Blender X, Z, -Y',
            'stats': STATS}
with open(os.path.join(ROOT, 'joints-rig.json'), 'w', encoding='utf-8') as f: json.dump(rig_info, f, indent=2)
print('SHADOW_RIG', json.dumps({'bones': len(BONES), 'meshes': len(meshes), 'triangles': tri}), flush=True)
