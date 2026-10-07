"""Shih Tzu Knight (shihtzu-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, world-axis game contract.

    blender --background --factory-startup --python rig_shihtzu-toy.py

Runs build_shihtzu-toy.py in RIG_MODE (part labels; lid / cavity / tongue charts in unused atlas space; the approved GLBs,
blend, atlas and json files are not touched), then adds (after Poe's and Moka's rigs):
  - the armature (exactly the hero contract, identity rest orientations, heads at the joints);
  - the mouth: the model's lip parting (already cut in round 4, corners shared) weighted to jaw / lip, a closed cavity pocket
    built on the parting and a tongue on its floor;
  - eyelids: rigid shells that are surfaces of revolution about their bone's X axis, just outside the eyeball, painted with
    the fur round the eye (white or black by region) and the lash on the upper lid's edge;
  - weights (spatial fields + part labels, <= 4 influences, quantized to an exact 255 sum);
and saves shihtzu-toy_rig.blend (only Armature modifiers left), joints-rig.json, rig-part-labels.json and
export/prop_mount.json (the flail in the right hand bone's frame; the flail stays its own prop, public/models/shihtzu-flail.glb).
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'build_shihtzu-toy.py').read_text(encoding='utf-8')
ns = {'__file__': str(ROOT / 'build_shihtzu-toy.py'), '__name__': 'shihtzu_model', 'RIG_MODE': True}
exec(compile(src, str(ROOT / 'build_shihtzu-toy.py'), 'exec'), ns)
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
smooth, au, MAT, M2L = ns['smooth'], ns['au'], ns['MAT'], ns['M2L']
head_sdf, front_hit = ns['head_sdf'], ns['front_hit']
NOSE_TIP_L = ns['NOSE_TIP_L']
def sm(a, b, x): return float(smooth(a, b, x))
def g3(v): v = np.asarray(v, float); return [round(float(v[0]), 5), round(float(v[2]), 5), round(float(-v[1]), 5)]
os.makedirs(ROOT / 'export', exist_ok=True); os.makedirs(ROOT / 'scratch', exist_ok=True)

# ---------------------------------------------------------------- bake world transforms, read part labels
base_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
labels = {}
for o in base_objects:
    names = [g.name.removeprefix('_part_') for g in o.vertex_groups]
    labels[o.name] = [names[max(v.groups, key=lambda g: g.weight).group] if v.groups else '' for v in o.data.vertices]
    mw = o.matrix_world.copy()
    for v in o.data.vertices: v.co = mw @ v.co
    o.matrix_world = Matrix.Identity(4)
OBJ = {o.name: o for o in base_objects}
print('OBJECTS', sorted(OBJ), flush=True)
head = OBJ['Shihtzu_head']

# ---------------------------------------------------------------- the mouth parting (cut in the model, round 4)
MA_X, MA_TOP, MA_UP = ns['MA_X'], ns['MA_TOP'], ns['MA_UP']
arch_z_m = ns['arch_z_m']
MHW = MA_X * W; CORNER_Z = CHIN + W * (MA_TOP + MA_UP); MZ = CHIN + W * MA_TOP
part_ids = list(ns['part_ids']); dup_of = dict(ns['dup_of'])
HV = np.array([list(v.co) for v in head.data.vertices])
_mi = ns['MOUTH_INFO']
assert np.abs(HV[part_ids] - np.array(_mi['parting_upper_m'])).max() < 2e-4, 'head vertex order changed: the parting ids no longer match'
LOWER_DUPS = set(dup_of.values())
rim = [tuple(HV[i]) for i in part_ids]                        # the parting, corner to corner (upper copies)
rim_lower_ids = [dup_of.get(i, i) for i in part_ids]          # the matching lower copies (the corners are shared)

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
JB = ns['JOINTS_BODY']; ARMJ = ns['ARM']
ARM = {s: {'upperarm': tuple(JB['arms'][t]['shoulder']), 'forearm': tuple(JB['arms'][t]['elbow']), 'hand': tuple(JB['arms'][t]['wrist'])}
       for s, t in ((1, 'L'), (-1, 'R'))}
LEG = {s: {'thigh': (s * .115, -.012, .335), 'shin': (s * .190, -.018, .198), 'foot': (s * .210, -.020, .092)} for s in (1, -1)}
neck_c = ns['L2M'](np.array(ns['NECK'][0]))
mouth_y = float(front_hit(0., MZ)[0])
P = {'root': (0, -.020, 0), 'hips': tuple(JB['hips']), 'spine': tuple(JB['spine']), 'chest': tuple(JB['chest']),
     'neck': tuple(JB['neck']),
     'head': (0, float(neck_c[1]) + .045, CHIN + .001),                     # skull base: the nod pivot at the back of the neck
     'jaw': (0, mouth_y + .22 * W, CORNER_Z)}                             # the hinge inside the head, 0.22 W behind the smile
BROW_Z = CHIN + (ns['EZW'] + ns['EHHW'] + .05) * W
# ear pivots: where the lock mass starts to swing (the five lock paths at that height, averaged), and the fold above the lobes
LS = ns['LOCK_SEG']
def lock_at(zw):
    pts = []
    for Pl, r in LS:
        k = int(np.argmin(np.abs(Pl[:, 2] - zw))); pts.append(Pl[k])
    return np.mean(pts, 0)
EAR_Z, TIP_Z = .80, .34                    # (W above the chin) the ear's swing starts below the merged top; the lobes below the fold
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * EX, float(front_hit(s * EX, BROW_Z)[0]) + .012, BROW_Z)
    P['lip_' + tag] = (s * MHW, float(front_hit(s * MHW, CORNER_Z)[0]) + .002, CORNER_Z)
    e0 = ns['L2M'](lock_at(EAR_Z) * np.array([1, 1, 1.])); e0[0] *= s
    t0 = ns['L2M'](lock_at(TIP_Z)); t0[0] *= s
    P['ear_' + tag] = (float(e0[0]) - s * .040, float(e0[1]) + .040, float(e0[2]) - .060)   # in from the mass centre, a little back and down (scratch/ear_opt.py)
    P['earTip_' + tag] = (float(t0[0]), float(t0[1]), float(t0[2]))
    for k, v in ARM[s].items(): P[k + '_' + tag] = v
    for k, v in LEG[s].items(): P[k + '_' + tag] = v
TP = np.array(ns['TAIL_PATH']); NTL = len(TP); TAIL_IDX = [3, 9, 18, 27]
for i in range(4): P['tail%d' % (i + 1)] = tuple(float(c) for c in TP[TAIL_IDX[i]])

# ---------------------------------------------------------------- BVHs of the approved skin and eyes
head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Shihtzu_eye_' + t].data.vertices],
                                    [tuple(p.vertices) for p in OBJ['Shihtzu_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
def front_y(x, z, tag):
    a = ray_y(eye_tree[tag], x, z); b = ray_y(skin_tree, x, z)
    c = [v for v in (a, b) if v is not None]; return min(c) if c else None

# ---------------------------------------------------------------- eyelids: rigid shells about the bone X axis (Poe / Moka construction)
def outline_z(X, top):
    a = np.clip(np.abs(X), 0, 1); return EZ + (1 if top else -1) * EHH * (1 - a ** EN) ** (1 / EN)
def skin_dist(x, pivot, phs, f=None):
    f = f or head_sdf; phs = np.asarray(phs, float); n = len(phs)
    d = np.stack([np.zeros(n), -np.cos(phs), np.sin(phs)], -1); o = np.array([x, pivot[1], pivot[2]])
    ts = np.linspace(.34, .02, 161)
    Pp = o + ts[None, :, None] * d[:, None, :]
    ins = (f(Pp.reshape(-1, 3)) < 0).reshape(n, len(ts)); i = np.argmax(ins, 1)
    lo = ts[i]; hi = ts[np.maximum(i - 1, 0)]
    for _ in range(10):
        m = (lo + hi) / 2; inn = f(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return np.where(ins.any(1), (lo + hi) / 2, .34)
def eye_dist(x, pivot, phs, tag):
    out = []
    for ph in phs:
        d = Vector((0, -math.cos(ph), math.sin(ph))); o = Vector((x, pivot[1], pivot[2]))
        h = eye_tree[tag].ray_cast(o + d * .34, -d, .34)
        out.append(.34 - h[3] if h[0] is not None else 0.)
    return np.array(out)
ROWS_U = [0, .015, .03, .045, .06, .09, .12, .155, .20, .26, .33, .42, .53, .66, .82, 1.0]     # dense at the lash edge (Poe 4b)
ROWS_D = [0, .04, .10, .18, .30, .46, .66, 1.0]
lid_info = {}; lid_objects = []; LID_PAINT = {}
SQ_U = float(os.environ.get('SQ_U', '.74')); SQ_D = float(os.environ.get('SQ_D', '-.36'))   # the happy squint the lids are designed for -> heroModels squint: [SQ_U, SQ_D]
# (a rigid lid on the 15 cm pivot that a 1.22 blink needs for the 13 cm opening travels 9.3 cm between 0.60 and 1.22: the edge
#  sits 28 % down the eye at the squint and on the rim when closed. At the default 0.488 it would either barely cover the top or
#  overshoot onto the cheek when closed.)
RIM_N = {}; LID_NRING = 1.02; LOG_MED = []; EYE_CAP = float(os.environ.get('EYE_CAP', '.0030'))
LID_PATCHES = bool(os.environ.get('LID_PATCHES'))
for tag_, s_ in (('L', 1), ('R', -1)):
    ps_ = np.linspace(0, 2 * math.pi, 72, endpoint=False); rx_, rz_ = ns['eye_xz'](s_, ps_, LID_NRING)
    ry_ = front_hit(rx_, rz_); RIM_N[tag_] = (np.stack([rx_, rz_], -1), ns['grad_n'](np.stack([rx_, ry_, rz_], -1)))
LID_BANDK = 1.075; LID_SINK0 = 0.; LID_SKT = 1.03; LID_NR = 1.
def head_sdf_nr(p):
    q = ns['M2L'](p); d = ns['base_local'](q); d = ns['smin'](d, ns['ell'](q, *ns['NECK']), ns['K_NECK'])
    return ns['smin'](d, ns['ell'](q, *ns['NOSE']), ns['K_N']) * W
def lid_normal(p, tag):
    s_ = 1 if tag == 'L' else -1; xz, N = RIM_N[tag]
    d2 = (xz[:, 0] - p[0]) ** 2 + (xz[:, 1] - p[2]) ** 2; w = 1 / (d2 + 1e-7) ** 1.5
    n = (w[:, None] * N).sum(0); n /= np.linalg.norm(n)
    sr = float(ns['eye_s'](s_, p[0], p[2])[0])
    if sr < 1.0 and LID_NR > 0:
        hy = float(front_hit(np.array([p[0]]), np.array([p[2]]), f=head_sdf_nr)[0])
        if np.isfinite(hy):
            t = LID_NR * float(smooth(1.0, .55, sr)); nk = ns['grad'](head_sdf_nr, np.array([[p[0], hy, p[2]]]))[0]
            n = (1 - t) * n + t * nk; n /= np.linalg.norm(n)
    if sr > 1.0:
        hy = float(front_hit(np.array([p[0]]), np.array([p[2]]))[0])
        if np.isfinite(hy):
            t = float(smooth(1.0, LID_SKT, sr)); nk = ns['grad_n'](np.array([[p[0], hy, p[2]]]))[0]
            n = (1 - t) * n + t * nk; n /= np.linalg.norm(n)
    return n
def lid_normal_closed(p, tag, tj=None):
    s_ = 1 if tag == 'L' else -1; sr = float(ns['eye_s'](s_, p[0], p[2])[0])
    hy = float(front_hit(np.array([p[0]]), np.array([p[2]]), f=head_sdf_nr)[0])
    if not np.isfinite(hy): return lid_normal(p, tag)
    n = ns['grad'](head_sdf_nr, np.array([[p[0], hy, p[2]]]))[0]
    if (tj if tj is not None else sr - CL_N0) > 0:
        hy2 = float(front_hit(np.array([p[0]]), np.array([p[2]]))[0])
        if np.isfinite(hy2):
            t = tj if tj is not None else float(smooth(CL_N0, CL_N1, sr)); nk = ns['grad_n'](np.array([[p[0], hy2, p[2]]]))[0]
            n = (1 - t) * n + t * nk
    return n / np.linalg.norm(n)
CL_N0, CL_N1 = 1.06, 1.18
LID_FACE = True
OV_IN = .0060; OV_MID = .0030
def lid_geometry(tag, upper, dz):
    s = 1 if tag == 'L' else -1
    cx = s * EX; ye = float(front_hit(cx, EZ)[0]); H = 2 * EHH
    if upper:
        zb_, zt_ = EZ - .97 * EHH, EZ + .97 * EHH
        B = np.array([ray_y(eye_tree[tag], cx, zb_), zb_]); T = np.array([ray_y(eye_tree[tag], cx, zt_), zt_])
        ch = T - B; Lc = float(np.linalg.norm(ch)); u = ch / Lc; nb = np.array([u[1], -u[0]])
        if nb[0] < 0: nb = -nb
        R = dz
        m = (B + T) / 2 + nb * math.sqrt(R * R - Lc * Lc / 4)
        yp, zp = float(m[0]), float(m[1])
    else:
        a_lev = .37 * H / .14; zp = (EZ - .40 * EHH) + dz; yp = ye + a_lev
    pivot = np.array([cx, yp, zp])
    Xs = np.linspace(-1.14, 1.14, 23) if upper else np.linspace(-.88, .88, 19)
    cols = []
    for X in Xs:
        x = cx + s * EHW * X
        zz = np.linspace(EZ - EHH * 1.06, EZ + EHH * (1.30 if upper else .55), 44)
        d_open = 0; d_band = 0
        for z in zz:
            y = front_y(x, z, tag)
            if y is None: continue
            inside_open = outline_z(X, False) - .009 * float(smooth(-.15, -.40, X)) <= z <= outline_z(X, True)
            Zn = (z - EZ) / EHH; srn = (abs(X) ** EN + abs(Zn) ** EN) ** (1 / EN)
            band = upper and Zn > -.05 and .96 <= srn <= 1.05 + float(ns['lash_th'](np.array([math.atan2(Zn, X)]))[0])
            low_open = (not upper) and outline_z(X, False) <= z <= (EZ - EHH) + .70 * EHH
            dd = math.hypot(yp - y, z - zp)
            if (inside_open if upper else low_open): d_open = max(d_open, dd)
            if band: d_band = max(d_band, dd)
        cols.append([X, x, d_open, d_band])
    for k in range(len(cols)):
        if cols[k][2] == 0:
            cols[k][2] = cols[min((abs(k - j), j) for j in range(len(cols)) if cols[j][2] > 0)[1]][2]
    gap = .0022 if upper else .0018
    if upper:
        for k in [k_ for k_ in range(len(cols)) if abs(cols[k_][0]) > 1.0 or k_ == len(cols) - 1]:
            x = cols[k][1]; yf = front_y(x, EZ, tag) or ye
            sk = float(skin_dist(x, pivot, [math.atan2(EZ - zp, yp - yf)])[0])
            cols[k][2] = (sk - gap + .0004) if cols[k][0] < 0 else min(cols[k][2], sk - gap - .002); cols[k][3] = 0
    def ang(z, r): return math.atan2(z - zp, math.sqrt(max(r * r - (z - zp) ** 2, 1e-9)))
    if upper:
        def closes(zl):
            for X, x, d_o, d_b in cols:
                r = d_o + gap
                if abs(X) <= 1.0 and zp + r * math.sin(ang(zl, r) - (1.22 - SQ_U)) > outline_z(X, False) - .0025: return False
            return True
        coverage = .27
        while coverage < .34 and not closes(EZ + EHH - coverage * 2 * EHH): coverage += .005
        z_level = EZ + EHH - coverage * 2 * EHH
    rows = ROWS_U if upper else ROWS_D
    target = 1.22 if upper else SQ_D
    if upper:
        U = []
        for X, x, d_o, d_b in cols:
            r0 = d_o + gap; ov = OV_MID + (OV_IN - OV_MID) * float(smooth(-.55, -1.0, X))
            U.append(max(zp + r0 * math.sin(ang(outline_z(X, False) - ov, r0) + (1.22 - SQ_U)), z_level))
        ZS = U
        PE = [ang(zs_, d_o + gap) - (1.22 - SQ_U) for zs_, (X, x, d_o, d_b) in zip(ZS, cols)]
    V = []; UVs = []; NRM = []; G = []; ARC = []; RAD = []; out_cols = []; DARK = []; RIMA = []; HSPAN = []
    for i, (X, x, d_o, d_b) in enumerate(cols):
        r0 = d_o + gap
        if upper:
            pe = PE[i]; pt = ang(outline_z(X, True) + EHH * .30, r0) + .28; phT = ang(outline_z(X, True), r0)
        else:
            arch = (EZ - EHH) + EHH * (.70 - .30 * min(abs(X) / .88, 1.) ** 2)
            pe = ang(arch, r0); pt = min(pe - .03, ang(min(arch, outline_z(X, False)) - .20 * EHH, r0))
        phs = [pe + (pt - pe) * t for t in rows]
        if upper:
            sk = skin_dist(x, pivot, phs)
            Zb = max(float(outline_z(X, True) - EZ) / EHH, .05)
            for _ in range(6):
                srt = LID_BANDK + float(ns['lash_th'](np.array([math.atan2(Zb, abs(X))]))[0])
                Zb = max(srt ** EN - min(abs(X), srt * .999) ** EN, 1e-6) ** (1 / EN)
            phB = ang(EZ + EHH * Zb, r0)
            rr = [r0 if ph < phT - .06 else max(r0, skin + gap - (gap + .0025) * float(smooth(phB + LID_SINK0, phB + LID_SINK0 + .10, ph))) for ph, skin in zip(phs, sk)]
            if LID_FACE:
                phR = ang(outline_z(X, False), r0)
                if abs(X) <= .95: rr = [(max(r, sk_ - .0004) if ph < phR - .012 else max(r, sk_ + .0008)) if ph < phR + .02 else r for r, ph, sk_ in zip(rr, phs, sk)]
            sq = 1.22 - SQ_U
            sk_sq = skin_dist(x, pivot, [ph + sq for ph in phs]); ed = eye_dist(x, pivot, phs, tag)
            rr = [min(r, max(sk_ - .0025, e_ + .0008)) if (ph + sq > phT - .04 and ph < phT - .06) else r
                  for r, ph, sk_, e_ in zip(rr, phs, sk_sq, ed)]
            rr = [max(r, e_ + (.0016 if t_ < .08 else .0008)) for r, e_, t_ in zip(rr, ed, rows)]
            if abs(X) > .95:
                for k_, ph in enumerate(phs):
                    zs_ = zp + rr[k_] * math.sin(ph + sq)
                    if float(np.asarray(ns['eye_s'](1 if tag == 'L' else -1, x, zs_)[0])) > 1.0:
                        rr[k_] = max(min(rr[k_], sk_sq[k_] - .0025), ed[k_] + .0008)
                    zc_ = zp + rr[k_] * math.sin(ph)
                    if float(np.asarray(ns['eye_s'](1 if tag == 'L' else -1, x, zc_)[0])) < 1.05:
                        rr[k_] = max(rr[k_], sk[k_] + .0004)
            # the Shih Tzu's eyes face 31 deg outward: the socket's outer lower lip lies far from the pivot, so the lash edge laid on
            # it would leave the forehead when the lid rotates up to rest. Every row stays >= 0.8 mm inside the head at rest.
            # rest clamp: every row tucks >= 0.8 mm inside the head at rest, as far as the eyeball (closed) and the squint allow;
            # rows that close above the opening (under the brow skin) are free to go in
            sk_rest = skin_dist(x, pivot, [ph + target for ph in phs]); ed_sq_ = eye_dist(x, pivot, [ph + sq for ph in phs], tag)
            def keep_out(r, ph, e_, eq_):
                zc_ = zp + r * math.sin(ph); zq_ = zp + r * math.sin(ph + sq)
                above = zc_ > outline_z(min(abs(X), .90), True) + .002
                vis_sq = float(np.asarray(ns['eye_s'](s, x, zq_)[0])) < 1.0
                return 0. if above else max(e_ + .0008, (eq_ + .0008) if vis_sq else 0.)
            rr = [min(r, max(skr - .0008, keep_out(r, ph, e_, eq_))) for r, ph, skr, e_, eq_ in zip(rr, phs, sk_rest, ed, ed_sq_)]
            # at the game's 0.488 squint the coverage rule pushes the closed edge 2-3 cm below the opening at the inner corner, in
            # front of the cheek: rows that close below the opening's lower outline hide just inside the cheek skin (still clear of
            # the eyeball at the squint and closed angles), so the closed lid visibly ends at the rim, where the lash is painted
            ed_sq = eye_dist(x, pivot, [ph + sq for ph in phs], tag); lowo = float(outline_z(X, False))
            def over_open(r, ph):           # at the squint, is this row over the visible eye opening?
                return float(np.asarray(ns['eye_s'](s, x, zp + r * math.sin(ph + sq))[0])) < 1.0
            if LID_PATCHES:
                rr = [min(r, max(sk_ - .0008, (eq_ + .0008) if over_open(r, ph) else 0., e_ + .0008)) if zp + r * math.sin(ph) < lowo - .002 else r
                      for r, ph, sk_, eq_, e_ in zip(rr, phs, sk, ed_sq, ed)]
            # last word: a row that closes below the eye's centre outside the opening (on the cheek) and outside the head is pulled
            # in along its pivot ray to 0.8 mm under the skin (bisection on the field), so nothing white drips below a closed eye
            for k_, ph in enumerate(phs):
                pc = np.array([[x, yp - rr[k_] * math.cos(ph), zp + rr[k_] * math.sin(ph)]])
                if pc[0, 2] > EZ or float(np.asarray(ns['eye_s'](s, pc[0, 0], pc[0, 2])[0])) < 1.0 or float(head_sdf(pc)[0]) < -.0008: continue
                lo_, hi_ = .02, rr[k_]
                for _ in range(24):
                    m_ = (lo_ + hi_) / 2; pm = np.array([[x, yp - m_ * math.cos(ph), zp + m_ * math.sin(ph)]])
                    if float(head_sdf(pm)[0]) < -.0008: lo_ = m_
                    else: hi_ = m_
                rr[k_] = lo_
            # round 5c: the inner-corner columns' upper rows were sized from the brow skin; at the squint they swung down in front of
            # the eye (a white panel from the 45-degree cameras). (a) Wherever a row lies over the opening at the squint or the
            # blink, it may stand at most EYE_CAP in front of the eyeball; (b) corner columns: a row outside the opening at the squint
            # is pulled under the skin (squint angle only: the closed lid's cover of the lash band is untouched).
            ed_c = eye_dist(x, pivot, phs, tag); ed_q = eye_dist(x, pivot, [ph + sq for ph in phs], tag)
            for k_, ph in enumerate(phs):
                floor_ = max(ed_c[k_] + .0008, (ed_q[k_] + .0008) if ed_q[k_] > 0 else 0.)
                for pa, edv in ((ph, ed_c[k_]), (ph + sq, ed_q[k_])):
                    if edv <= 0: continue
                    if float(np.asarray(ns['eye_s'](s, x, zp + rr[k_] * math.sin(pa))[0])) < .97:
                        rr[k_] = min(rr[k_], max(edv + EYE_CAP, floor_))
                if abs(X) > .90:
                    pa = ph + sq; pc = np.array([[x, yp - rr[k_] * math.cos(pa), zp + rr[k_] * math.sin(pa)]])
                    if float(np.asarray(ns['eye_s'](s, pc[0, 0], pc[0, 2])[0])) >= 1.0 and float(head_sdf(pc)[0]) > -.0008:
                        lo_, hi_ = .02, rr[k_]
                        for _ in range(24):
                            m_ = (lo_ + hi_) / 2; pm = np.array([[x, yp - m_ * math.cos(pa), zp + m_ * math.sin(pa)]])
                            if float(head_sdf(pm)[0]) < -.0008: lo_ = m_
                            else: hi_ = m_
                        rr[k_] = max(lo_, floor_ if float(np.asarray(ns['eye_s'](s, x, zp + lo_ * math.sin(ph))[0])) < 1.0 else 0.)
        else:
            phR = ang(outline_z(X, False), r0)
            rr = [r0 - .0035 * float(smooth(phR + .01, phR - .06, ph)) for ph in phs]
        out_cols.append((x, r0, pe, pt))
        if upper:
            DARK.append(.0018 + .0052 * max(0., 1 - min(abs(X), 1.) ** 2) ** .6)
            RIMA.append((ang(outline_z(X, False), r0) - pe) * r0)
            HSPAN.append((ang(outline_z(X, True), r0) - (1.22 - SQ_U) - pe) * r0)
        g_row = []; a_row = []
        for j, (t, ph, r) in enumerate(zip(rows, phs, rr)):
            ph_rest = ph + target
            V.append((x, yp - r * math.cos(ph_rest), zp + r * math.sin(ph_rest)))
            UVs.append((i / (len(cols) - 1), t))
            pz_t = zp + r * math.sin(ph); py_t = yp - r * math.cos(ph)
            g_row.append((x, py_t, pz_t)); a_row.append(abs(ph - pe) * r0)
            nrm = (lid_normal_closed(np.array([x, py_t, pz_t]), tag, tj=float(smooth(phB - .12, phB - .01, ph)) if ph > phT - .06 else 0.)
                   if (upper and LID_FACE) else lid_normal(np.array([x, py_t, pz_t]), tag))
            c, s_ = math.cos(-target), math.sin(-target)
            nb_ = np.array((nrm[0], nrm[1] * c - nrm[2] * s_, nrm[1] * s_ + nrm[2] * c))
            if upper:
                hid = float(smooth(-.0004, -.0016, float(head_sdf(np.array([[x, py_t, pz_t]]))[0])))
                if hid > 0:
                    ph_s = ph + (1.22 - SQ_U); ns_ = lid_normal(np.array([x, yp - r * math.cos(ph_s), zp + r * math.sin(ph_s)]), tag)
                    c2, s2 = math.cos(-SQ_U), math.sin(-SQ_U)
                    nq_ = np.array((ns_[0], ns_[1] * c2 - ns_[2] * s2, ns_[1] * s2 + ns_[2] * c2))
                    nb_ = (1 - hid) * nb_ + hid * nq_; nb_ /= np.linalg.norm(nb_)
            NRM.append(tuple(nb_))
        G.append(g_row); ARC.append(a_row); RAD.append(rr)
    nr = len(rows)
    if upper and len(RAD) >= 3:
        R_ = np.array(RAD); Rm_ = R_.copy()
        for i in range(1, len(RAD) - 1): Rm_[i] = np.median(R_[i - 1:i + 2], axis=0)
        Rm_[0] = np.minimum(R_[0], Rm_[1] + .002); Rm_[-1] = np.minimum(R_[-1], Rm_[-2] + .002)
        for i, (X, x, d_o, d_b) in enumerate(cols):
            pe_, pt_ = out_cols[i][2], out_cols[i][3]; phs_ = [pe_ + (pt_ - pe_) * t for t in rows]
            for j, (ph, r) in enumerate(zip(phs_, Rm_[i])):
                ph_rest = ph + target; V[i * nr + j] = (x, yp - r * math.cos(ph_rest), zp + r * math.sin(ph_rest))
                G[i][j] = (x, yp - r * math.cos(ph), zp + r * math.sin(ph))
        LOG_MED.append(float(np.abs(Rm_ - R_).max()))
    fs = []
    for i in range(len(cols) - 1):
        for j in range(nr - 1):
            q = i * nr + j; fs.append((q, q + nr, q + nr + 1, q + 1))
    closure = None
    if upper:
        closure = max(zp + r0 * math.sin(pe) - (outline_z(X, False) - .0015) for (X, x, d_o, d_b), (x_, r0, pe, pt) in zip(cols, out_cols) if abs(X) <= .95)
        x_c, r_c, pe_c, pt_c = out_cols[len(cols) // 2]
        phs_c = np.linspace(pe_c, ang(outline_z(0, True), r_c), 12); dev = []
        for ph in phs_c:
            h_ = eye_tree[tag].ray_cast(Vector((x_c, yp, zp)) + Vector((0, -math.cos(ph), math.sin(ph))) * .34, Vector((0, math.cos(ph), -math.sin(ph))), .34)
            if h_[0] is not None: dev.append(r_c - (.34 - h_[3]))
        deep = max(max(0., (outline_z(X, False) - .004) - (zp + r0 * math.sin(pe))) for (X, x, d_o, d_b), (x_, r0, pe, pt) in zip(cols, out_cols) if abs(X) <= .95)
        closure = (closure, coverage, max(dev) if dev else 0, deep)
    paint = {'G': np.array(G), 'arc': np.array(ARC), 'X': np.array([c[0] for c in cols]), 'rows': np.array(rows), 'dark': np.array(DARK), 'rim_arc': np.array(RIMA), 'hspan': np.array(HSPAN)}
    return V, UVs, fs, pivot, out_cols, target, NRM, closure, paint
def rest_exposure(V, pivot, angs):
    V = np.array(V); worst = -9.
    for a in angs:
        c, s_ = math.cos(a), math.sin(a); d = V - pivot
        Vr = np.stack([d[:, 0], d[:, 1] * c - d[:, 2] * s_, d[:, 1] * s_ + d[:, 2] * c], -1) + pivot
        worst = max(worst, float(head_sdf(Vr).max()))
    return worst
# ---------------------------------------------------------------- round 5b: the tilted lid hinge (HERO_MODELS lidTilt)
# The game turns lidU / lidD about (cos t, 0, -/+ sin t) in game axes (L / R) = Blender (cos t, +/- sin t, 0): a horizontal hinge
# square to each eye's outward-facing axis, through the lid bone's head. Each lid is designed in its eye's own frame (the head
# and the eye rotated about the vertical through the eye's surface centre so the eye faces -Y and the hinge is X), with the
# Poe construction unchanged, then rotated back. The pivot cannot be the eye's centre: the opening is 13 cm tall, so a 1.22 rad
# blink needs a hinge >= 10.6 cm behind the eye surface (the pivot search below).
HEAD_SDF_W = ns['head_sdf']; FRONT_HIT_W = ns['front_hit']; HEAD_SDF_NR_W = head_sdf_nr
GRAD_N_W = ns['grad_n']; EX_W, EZ_W, EHW_W, EHH_W = EX, EZ, EHW, EHH
def Rz(phi):
    c, s_ = math.cos(phi), math.sin(phi); return np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1.]])
EYE_FRAME = {}
for tag_, s_ in (('L', 1), ('R', -1)):
    Sc_ = np.array([s_ * EX_W, float(FRONT_HIT_W(s_ * EX_W, EZ_W)[0]), EZ_W]); ax_ = GRAD_N_W(Sc_[None])[0]
    EYE_FRAME[tag_] = {'Sc': Sc_, 's': s_, 'a_measured': math.atan2(s_ * ax_[0], -ax_[1])}
LID_TILT = round(float(np.mean([EYE_FRAME[t]['a_measured'] for t in 'LR'])), 4)
for t_ in 'LR':
    f_ = EYE_FRAME[t_]; f_['Rw'] = Rz(f_['s'] * LID_TILT); f_['Rl'] = Rz(-f_['s'] * LID_TILT)
def hinge(tag): return EYE_FRAME[tag]['Rw'] @ np.array([1., 0, 0])
def to_world(q, tag):
    f_ = EYE_FRAME[tag]; q = np.asarray(q, float); return f_['Sc'] + (q - f_['Sc']) @ f_['Rw'].T
def to_local(p, tag):
    f_ = EYE_FRAME[tag]; p = np.asarray(p, float); return f_['Sc'] + (p - f_['Sc']) @ f_['Rl'].T
print('LID_TILT', LID_TILT, 'hinge L', hinge('L').round(4).tolist(), 'R', hinge('R').round(4).tolist(), flush=True)
def eye_context(tag):
    f_ = EYE_FRAME[tag]; s_ = f_['s']
    HVl = to_local(HV, tag)
    sk_t = BVHTree.FromPolygons([Vector(p) for p in HVl], [tuple(t.vertices) for t in head.data.loop_triangles])
    eo = OBJ['Shihtzu_eye_' + tag]; EVl = to_local(np.array([list(v.co) for v in eo.data.vertices]), tag)
    ey_t = BVHTree.FromPolygons([Vector(p) for p in EVl], [tuple(p.vertices) for p in eo.data.polygons])
    rimL = to_local(HV[ns['roll_info'][s_][0]], tag)                  # the eyelid hole's rim loop, in the eye's frame
    xs, zs = rimL[:, 0], rimL[:, 2]
    EXl = abs(float(xs.max() + xs.min()) / 2); EZl = float(zs.max() + zs.min()) / 2
    EHWl = float(xs.max() - xs.min()) / 2; EHHl = float(zs.max() - zs.min()) / 2
    def eye_xz_l(side, psi, k=1.0):
        ux, uz = ns['eye_unit'](psi); return side * EXl + side * EHWl * k * ux, EZl + EHHl * k * uz
    def eye_s_l(side, x, z):
        X = side * (np.asarray(x) - side * EXl) / EHWl; Z = (np.asarray(z) - EZl) / EHHl
        return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
    def hsdf_l(q):
        q = np.asarray(q, float); return np.asarray(HEAD_SDF_W(to_world(q.reshape(-1, 3), tag))).reshape(q.shape[:-1])
    def hsdf_nr_l(q):
        q = np.asarray(q, float); return np.asarray(HEAD_SDF_NR_W(to_world(q.reshape(-1, 3), tag))).reshape(q.shape[:-1])
    def front_hit_l(x, z, f=None): return FRONT_HIT_W(x, z, f if f is not None else hsdf_l)
    def grad_n_l(p, f=None, e=1.5e-4): return ns['grad'](f if f is not None else hsdf_l, p, e)
    return {'tag': tag, 'front_hit': front_hit_l, 'head_sdf': hsdf_l, 'head_sdf_nr': hsdf_nr_l, 'skin_tree': sk_t, 'eye_tree': ey_t,
            'EX': EXl, 'EZ': EZl, 'EHW': EHWl, 'EHH': EHHl, 'eye_s': eye_s_l, 'eye_xz': eye_xz_l, 'grad_n': grad_n_l,
            'outline_z': lambda X, top, EZl=EZl, EHHl=EHHl: EZl + (1 if top else -1) * EHHl * (1 - np.clip(np.abs(X), 0, 1) ** EN) ** (1 / EN),
            'fit': [round(EXl, 4), round(EZl, 4), round(EHWl, 4), round(EHHl, 4)]}
SWAP = {}; CUR = {}
def enter(tag):
    ctx = eye_context(tag); g = globals(); s_ = EYE_FRAME[tag]['s']
    for k in ('front_hit', 'head_sdf', 'head_sdf_nr', 'skin_tree', 'EX', 'EZ', 'EHW', 'EHH'):
        SWAP[k] = g[k]; g[k] = ctx[k]
    SWAP['eye_tree'] = g['eye_tree']; g['eye_tree'] = {tag: ctx['eye_tree']}
    for k in ('eye_s', 'eye_xz', 'grad_n'):
        SWAP['ns:' + k] = ns[k]; ns[k] = ctx[k]
    ps_ = np.linspace(0, 2 * math.pi, 72, endpoint=False); rx_, rz_ = ctx['eye_xz'](s_, ps_, LID_NRING)
    ry_ = ctx['front_hit'](rx_, rz_); SWAP['RIM_N'] = dict(RIM_N)
    RIM_N[tag] = (np.stack([rx_, rz_], -1), ctx['grad_n'](np.stack([rx_, ry_, rz_], -1)))
    CUR.clear(); CUR.update(ctx)
    print('EYE_FRAME', tag, 'fit EX EZ EHW EHH', ctx['fit'], flush=True)
    return ctx
def leave():
    g = globals()
    for k, v in SWAP.items():
        if k.startswith('ns:'): ns[k[3:]] = v
        elif k == 'RIM_N': RIM_N.clear(); RIM_N.update(v)
        else: g[k] = v
    SWAP.clear(); CUR.clear()
def rot_axis(V, Pv, axis, ang):
    k = np.asarray(axis, float) / np.linalg.norm(axis); d = np.asarray(V, float) - Pv
    c, s_ = math.cos(ang), math.sin(ang)
    return Pv + d * c + np.cross(k, d) * s_ + np.outer(d @ k, k) * (1 - c)
def lid_shell(tag, upper):
    angs = [0.0] if upper else [0.0, -.10]
    cands = np.array([.095, .105, .115, .125, .135, .150, .170, .190]) if upper else np.linspace(0, .32, 17)
    best = None
    for dz in cands:
        try:
            g = lid_geometry(tag, upper, float(dz))
        except (ValueError, TypeError, ZeroDivisionError) as ex:
            print('LID_CAND_FAIL', tag, upper, float(dz), repr(ex), flush=True); continue
        e = rest_exposure(g[0], g[3], angs)
        if upper: print('LID_CAND', tag, float(dz), 'rest_exposure_mm %.2f' % (e * 1000), 'closure', [round(float(v), 4) for v in g[7]], flush=True)
        if upper:
            e = (0 if e < -.0005 else 1 + e * 100) + (0 if g[7][0] <= 0 else 1 + g[7][0] * 100) + abs(g[7][1] - .28) + 4 * g[7][2] + 60 * g[7][3]
        else:
            e = (0 if e < -.0002 else 1 + e * 100) + .05 * dz
        if best is None or e < best[0]: best = (e, float(dz), g)
    e, dz, (V, UVs, fs, pivot, cols, target, NRM, closure, paint) = best
    chart = 'lidU' if upper else 'lidD'
    if tag == 'L': paint['ctx'] = dict(CUR); paint['tag'] = tag; paint['pivot_local'] = np.array(pivot); LID_PAINT[chart] = paint
    name = ('Shihtzu_lidU_' if upper else 'Shihtzu_lidD_') + tag
    Rw_ = EYE_FRAME[tag]['Rw']; V = to_world(np.array(V), tag).tolist(); NRM = (np.array(NRM) @ Rw_.T).tolist(); pivot_l = np.array(pivot); pivot = to_world(pivot_l, tag)
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], fs); me.update()
    layer = me.uv_layers.new(name='Atlas')
    for p in me.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer.data[l].uv = au(chart, UVs[me.loops[l].vertex_index][1], UVs[me.loops[l].vertex_index][0])
    bm = bmesh.new(); bm.from_mesh(me); hk = hinge(tag)
    for f in bm.faces:
        c = np.array(f.calc_center_median()) - pivot; rv = c - hk * (c @ hk)
        if np.dot(np.array(f.normal), rv) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
    me.normals_split_custom_set([tuple(NRM[me.loops[l].vertex_index]) for l in range(len(me.loops))])
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT)
    lid_objects.append((ob, ('lidU_' if upper else 'lidD_') + tag))
    lid_info[name] = {'pivot': [float(v) for v in pivot], 'pivot_eye_frame': [float(v) for v in pivot_l], 'hinge_blender': [round(float(v), 5) for v in hinge(tag)],
                      'pivot_behind_eye_surface_m': round(float(pivot_l[1] - EYE_FRAME[tag]['Sc'][1]), 4), 'pivot_offset_m': dz, 'score': round(e, 4),
                      'closed_edge_above_rim_mm': None if closure is None else round(closure[0] * 1000, 2),
                      'squint_coverage': None if closure is None else round(closure[1], 3),
                      'closed_standoff_centre_mm': None if closure is None else round(closure[2] * 1000, 2),
                      'closed_edge_deepest_below_rim_mm': None if closure is None else round(closure[3] * 1000, 1), 'target': target}
    print('LID', name, json.dumps(lid_info[name]), 'median_shift_max_mm', round(LOG_MED[-1] * 1000, 2) if LOG_MED else None, flush=True)
    return tuple(float(v) for v in pivot)
for tag in (('L',) if os.environ.get('LIDS_ONLY') else 'LR'):
    enter(tag)
    try:
        P['lidU_' + tag] = lid_shell(tag, True)
        P['lidD_' + tag] = lid_shell(tag, False)
    finally:
        leave()
if os.environ.get('LIDS_ONLY'): print('LIDS_ONLY_DONE', flush=True); sys.exit(0)

RING_K = 1.10
LASH_T = float(os.environ.get('LASH_T', '.0105')); LASH_WING = float(os.environ.get('LASH_WING', '.0035'))
def paint_lids():
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    w_, h_ = img.size; px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    rgb, mix = ns['rgb'], ns['mix']
    def paint_at(Pw, band=False, blush=False):           # the head's own paint at world points (radial lookup from the head centre)
        d = Pw - ns['O']; d /= np.linalg.norm(d, axis=1, keepdims=True); uv = ns['head_uv'](d)
        ns['PAINT_OPTS']['band'] = band; ns['PAINT_OPTS']['blush'] = blush
        C = np.asarray(ns['paint_head'](uv[:, 0], uv[:, 1])).reshape(-1, 3)
        ns['PAINT_OPTS']['band'] = True; ns['PAINT_OPTS']['blush'] = True
        return C
    for chart, info in LID_PAINT.items():
        cx_ = info['ctx']; tg = info['tag']
        x0, y0, w, h = ns['CHARTS'][chart]
        Vv, U = np.meshgrid(np.clip((np.arange(w) - 6) / (w - 12), 0, 1), np.clip((np.arange(h) - 6) / (h - 12), 0, 1))   # transposed
        G = info['G']; A = info['arc']; rows = info['rows']; nc = G.shape[0]
        fi = U * (nc - 1); i0 = np.clip(np.floor(fi).astype(int), 0, nc - 2); a = fi - i0
        j0 = np.clip(np.searchsorted(rows, Vv, side='right') - 1, 0, len(rows) - 2); b = (Vv - rows[j0]) / (rows[j0 + 1] - rows[j0])
        def bil(F):
            F = np.asarray(F); e = (Ellipsis,) + (None,) * (F.ndim - 2)
            return (F[i0, j0] * ((1 - a) * (1 - b))[e] + F[i0 + 1, j0] * (a * (1 - b))[e]
                    + F[i0, j0 + 1] * ((1 - a) * b)[e] + F[i0 + 1, j0 + 1] * (a * b)[e])
        Pp = bil(G).reshape(-1, 3); arc = bil(A)                          # the closed lid, eye frame
        # over the opening: the fur round the eye (Shepard 1/d^3 from the skin's paint on a ring just outside the rim)
        psr = np.linspace(0, 2 * math.pi, 96, endpoint=False); rx, rz = cx_['eye_xz'](1, psr, RING_K)
        ry = cx_['front_hit'](rx, rz); RC = paint_at(to_world(np.stack([rx, ry, rz], -1), tg))
        d2 = (Pp[:, 0, None] - rx[None]) ** 2 + (Pp[:, 2, None] - rz[None]) ** 2; wr = 1 / (d2 + 1e-7) ** 1.5
        C = ((wr[..., None] * RC[None]).sum(1) / wr.sum(1)[:, None]).reshape(h, w, 3)
        # outside the opening the lid takes the colour of the skin it lies on (white or black fur), so nothing shows a seam
        Cs = paint_at(to_world(Pp, tg)).reshape(h, w, 3)
        srp = np.asarray(cx_['eye_s'](1, Pp[:, 0], Pp[:, 2])[0]).reshape(h, w)
        C = mix(C, Cs, smooth(1.00, 1.06, srp))
        if chart == 'lidU':
            pv = info['pivot_local']; dq = 1.22 - SQ_U; c_, s_ = math.cos(dq), math.sin(dq)
            dy, dz_ = Pp[:, 1] - pv[1], Pp[:, 2] - pv[2]
            Psq = np.stack([Pp[:, 0], pv[1] + dy * c_ + dz_ * s_, pv[2] + dz_ * c_ - dy * s_], -1)
            Cq = paint_at(to_world(Psq, tg)).reshape(h, w, 3)
            srq, _a, _X, Znq = cx_['eye_s'](1, Psq[:, 0], Psq[:, 2])
            hid_b = smooth(-.0004, -.0016, cx_['head_sdf'](Pp)).reshape(h, w)
            wq = hid_b * (smooth(.885, .92, srq) * smooth(0, .2, Znq)).reshape(h, w)
            C = mix(C, Cq, wq)
            Xt = info['X'][i0] * (1 - a) + info['X'][i0 + 1] * a
            # the closed-eye lash (Poe 4b): a band along the lid's edge, which lies on the opening's lower rim when closed (one soft
            # U) and is the visible lid edge at the happy squint; thinner at the inner corner, a short wing at the outer one
            T_ = (LASH_T * (.45 + .55 * smooth(-.95, -.40, Xt)) * smooth(-1.0, -.88, Xt) + LASH_WING * smooth(.55, 1.0, Xt)) * (1 - smooth(.99, 1.07, Xt))
            lash_ = (1 - smooth(T_ - .0007, T_ + .0007, arc)) * (1 - smooth(1.00, 1.03, srp))     # only where the closed lid is over the opening
            C = mix(C, rgb('#141216'), lash_)
        else:
            C = mix(C, rgb('#2E262C'), .85 * (1 - smooth(.0016, .0030, arc)))          # the lower lid's top edge: a defined dark arch (happy "^ ^")
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'shihtzu-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()

# ---------------------------------------------------------------- weights
CUT = .94 * MHW
def lip_w(x, z):
    return .85 * math.exp(-((abs(x) - MHW) / (.034 * W)) ** 2 - ((z - CORNER_Z) / (.034 * W)) ** 2)
D_JAW = .090      # W: the lower lip's drop at full jaw weight at jaw +0.42 (0.22 W hinge arm)
MA_Z0 = float(ns['mouth_arch'](np.array([0.]))[0, 1])
def lip_travel(xl):
    """the lower lip edge's share of the jaw's drop across the mouth: the open edge becomes a smooth U (full at the centre,
    less on the omega's lobes, none at the sealed corners), not the omega dropped whole"""
    t = min(abs(xl) / MA_X, 1.)
    ze = float(ns['mouth_arch'](np.array([t]))[0, 1]); g = max(0., 1 - t * t) ** .6
    return float(np.clip((ze - MA_Z0) / D_JAW + g, 0, 1))
def jaw_w(x, y, z, kind):
    q = M2L(np.array([x, y, z])); xl, yl, zl = q; b = yl - NOSE_TIP_L
    sharp = 1.0 if kind == 'lower' else 0.0
    field = 1 - sm(-.006 * W, .010 * W, z - float(arch_z_m(x)))
    we = sm(.74 * CUT, CUT, abs(x)); below = sharp * (1 - we) + field * we
    lat = 1 - sm(.17, .31, abs(xl)); back = 1 - sm(.46, .66, b)          # the lower lip band, beard puff and chin; a soft falloff into the cheeks
    base = below * lat * back * (1 - sm(MA_TOP + .010, MA_TOP + .050, zl))
    near = 1 - sm(.010 * W, .080 * W, float(arch_z_m(x)) - z)            # the profile at the lip, fading out down the chin
    return base * (lip_travel(xl) * near + (1 - near))
def head_kind(i, p):
    if i in LOWER_DUPS: return 'lower'
    if i in set(part_ids): return 'upper'
    x, y, z = p
    return 'lower' if (z < float(arch_z_m(x)) and abs(x) < CUT and y < HY - .10) else 'upper'
def face_weights(p, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    q = M2L(np.array(p)); zl = q[2]; b = q[1] - NOSE_TIP_L
    lip = lip_w(x, z) * (1 - sm(-.22, -.12, y - HY))
    jw = jaw_w(x, y, z, kind)
    neck = sm(-.01, -.12, zl) * (.55 + .45 * sm(.30, .55, b))
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
def ear_weights(p, side):
    zl = float(M2L(np.array(p))[2])
    mv = 1 - sm(.55, .80, zl)                      # the merged top over the skull stays on the head; the hanging mass swings
    tip = 1 - sm(.15, .40, zl)                     # the lower lobes swing on earTip, blending across the fold
    return {'head': 1 - mv, 'ear_' + side: mv * (1 - tip), 'earTip_' + side: mv * tip}
def torso(z):                                       # hips / spine / chest along the torso (the belt height stays on the hips)
    h_ = 1 - sm(.46, .53, z); c_ = sm(.54, .62, z); return h_, (1 - h_) * (1 - c_), (1 - h_) * c_
def arm_t(p, s):
    sh = np.array(ARM[s]['upperarm']); wr_ = np.array(ARM[s]['hand']); d = wr_ - sh
    return float((np.array(p) - sh) @ d / (d @ d))
def thighs_split(x, amt):
    l_ = sm(-.06, .06, x); return {'thigh_L': amt * l_, 'thigh_R': amt * (1 - l_)}
def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'; s_ = 1 if side == 'L' else -1
    if lab == 'armour_torso':
        h_, sp_, c_ = torso(z)
        arm = .30 * sm(.17, .23, abs(x)) * sm(.55, .61, z)
        return {'hips': h_, 'spine': sp_, 'chest': c_ * (1 - arm), 'upperarm_' + side: c_ * arm}
    if lab in ('white_chest_ruff', 'plum_hood_roll', 'plum_hood_bag'):
        hd = (.30 if lab != 'white_chest_ruff' else .22) * sm(.62, .69, z)
        nk = (.30 + .30 * sm(.63, .70, z)) * (1 - hd); return {'head': hd, 'neck': nk, 'chest': 1 - hd - nk}
    if lab.startswith(('pauldron', 'pauldron_trim', 'pauldron_edge', 'pauldron_rivet')):
        up = .60 + .30 * sm(.22, .32, abs(x)); return {'upperarm_' + side: up, 'chest': 1 - up}
    if lab in ('dark_belt', 'paw_buckle') or lab.startswith('buckle_tab'): return {'hips': 1}
    if lab.startswith('tome'): return {'hips': .70, 'thigh_L': .30}
    if lab.startswith('tabard_panel'):
        amt = .58 * sm(.40, .16, z); w = {'hips': 1 - amt}
        if lab.endswith('centre'): w.update(thighs_split(x, amt))
        else: w['thigh_' + lab[-1]] = amt
        return w
    if lab.startswith('black_fur_shorts'):
        t_ = lab[-1]; hp = .85 * sm(.31, .41, z); seat = .25 * sm(.05, .20, y) * sm(.22, .32, z) * (1 - hp)
        shin = .40 * sm(.21, .16, z); rest = 1 - hp - seat
        return {'hips': hp + seat, 'thigh_' + t_: rest * (1 - shin), 'shin_' + t_: rest * shin}
    if lab.startswith('black_fur_leg'):
        t_ = lab[-1]; sh = 1 - sm(.165, .225, z); hp = .30 * sm(.27, .33, z)
        return {'shin_' + t_: sh, 'thigh_' + t_: (1 - sh) * (1 - hp), 'hips': (1 - sh) * hp}
    if lab.startswith('white_leg_cuff'):
        t_ = lab[-1]; ft = .30 * sm(.115, .088, z); return {'shin_' + t_: 1 - ft, 'foot_' + t_: ft}
    if lab.startswith(('black_boot', 'silver_toe_cap', 'silver_heel_cap')):
        t_ = lab[-1]; sh = .30 * sm(.075, .100, z); return {'foot_' + t_: 1 - sh, 'shin_' + t_: sh}
    return {'spine': 1}
def cloak_weights(p):
    x, y, z = p
    c_ = sm(.52, .60, z); h_ = 1 - sm(.40, .50, z)
    amt = .34 * sm(.36, .20, z)
    w = {'chest': c_, 'spine': (1 - c_) * (1 - h_), 'hips': (1 - c_) * h_ * (1 - amt)}
    for k, v in thighs_split(x, (1 - c_) * h_ * amt).items(): w[k] = v
    return w
def arm_weights(p, lab, t_):
    s_ = 1 if t_ == 'L' else -1; t = arm_t(p, s_)
    if lab.startswith('black_mitten_paw'):
        fore = 1 - sm(.98, 1.10, t); return {'hand_' + t_: 1 - fore, 'forearm_' + t_: fore}
    if lab.startswith('white_wrist_fur'):
        hd = sm(.86, 1.02, t); return {'hand_' + t_: hd, 'forearm_' + t_: 1 - hd}
    if lab.startswith('silver_gauntlet_cuff'):
        up = .35 * (1 - sm(.58, .66, t)); return {'upperarm_' + t_: up, 'forearm_' + t_: 1 - up}
    if lab.startswith('armour_sleeve'):
        chest = .30 * (1 - sm(-.20, .12, t)); fore = sm(.56, .70, t)
        return {'chest': chest, 'upperarm_' + t_: (1 - chest) * (1 - fore), 'forearm_' + t_: (1 - chest) * fore}
    return {'upperarm_' + t_: 1}
# the tail: weights by the sweep's own ring index (the curl's turns sit too close for a nearest-point lookup)
TAIL_SIDES = 10
def tail_ring(i, nverts):
    nr = NTL * TAIL_SIDES
    if i < nr: return i // TAIL_SIDES
    return 0 if i < nr + (nverts - nr) // 2 else NTL - 1
def tail_weights(k):
    s = k / (NTL - 1); st = [i / (NTL - 1) for i in TAIL_IDX] + [1.01]
    w = {}
    for i in range(4):
        a, b = st[i], st[i + 1]
        if a <= s < b or (i == 3 and s >= a):
            f = (s - a) / (b - a); blend = sm(.70, 1.0, f) if i < 3 else 0.
            w['tail%d' % (i + 1)] = 1 - blend
            if i < 3: w['tail%d' % (i + 2)] = blend
    if not w: w = {'tail1': 1.}
    hips = 1 - sm(1. / (NTL - 1), 3.5 / (NTL - 1), s)    # the stem under the cloak hem stays on the hips; the curl swings from tail1
    w = {kk: v * (1 - hips) for kk, v in w.items()}; w['hips'] = w.get('hips', 0) + hips
    return w

# ---------------------------------------------------------------- the armature
HERO = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'jaw']
for tag in 'LR': HERO += [k + '_' + tag for k in ('eye', 'lidU', 'lidD', 'brow', 'lip', 'ear', 'earTip', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot')]
HERO += ['tail1', 'tail2', 'tail3', 'tail4']
PARENT = {'root': None, 'hips': 'root', 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck', 'jaw': 'head',
          'tail1': 'hips', 'tail2': 'tail1', 'tail3': 'tail2', 'tail4': 'tail3'}
for tag in 'LR':
    PARENT.update({f'eye_{tag}': 'head', f'lidU_{tag}': 'head', f'lidD_{tag}': 'head', f'brow_{tag}': 'head', f'lip_{tag}': 'head',
                   f'ear_{tag}': 'head', f'earTip_{tag}': f'ear_{tag}', f'upperarm_{tag}': 'chest', f'forearm_{tag}': f'upperarm_{tag}',
                   f'hand_{tag}': f'forearm_{tag}', f'thigh_{tag}': 'hips', f'shin_{tag}': f'thigh_{tag}', f'foot_{tag}': f'shin_{tag}'})
assert len(HERO) == 37 and set(HERO) == set(P), set(HERO) ^ set(P)
adata = bpy.data.armatures.new('Shihtzu_game_skeleton'); arm = bpy.data.objects.new('Shihtzu_Rig', adata); bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in HERO:
    b = adata.edit_bones.new(name); b.head = P[name]; b.tail = Vector(P[name]) + Vector((0, .04, 0)); b.roll = 0
    if PARENT[name]: b.parent = adata.edit_bones[PARENT[name]]
    b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for b in arm.pose.bones: b.rotation_mode = 'YZX'
arm.show_in_front = True

# ---------------------------------------------------------------- the mouth cavity and tongue (behind the parting)
def skin_front(x, z):
    y = ray_y(skin_tree, x, z); return y if y is not None else float(front_hit(x, z)[0])
HK = {}
for i in range(len(HV)): pass
cav_v = []; cav_w = []; cav_f = []; D = 3; n = len(rim)
up_w = [face_weights(HV[i], 'upper') for i in part_ids]
lo_w = [face_weights(HV[j], 'lower') for j in rim_lower_ids]
for level in ('upper', 'lower'):
    for j in range(D + 1):
        t = j / D
        for k, (x, y, z) in enumerate(rim):
            corner = max(1 - sm(.74 * CUT, CUT, abs(x)), .25)     # (a floor: the pocket's side walls have height at the corners)
            pz = z + (.014 * W if level == 'upper' else -.090 * W) * math.sin(t * math.pi * .5) * corner
            py = y + .0015 + .140 * W * t * (.35 + .65 * corner)
            px = x * (1 + .10 * t)
            if j: py = max(py, skin_front(px, pz) + .005)
            cav_v.append((px, py, pz))
            sd = 'L' if x >= 0 else 'R'
            if level == 'upper': ww = {'head': 1 - up_w[k]['lip_' + sd], 'lip_' + sd: up_w[k]['lip_' + sd]}
            else: ww = dict(lo_w[k])
            cav_w.append(ww)
for k in range(2):
    off = k * (D + 1) * n
    for j in range(D):
        for i in range(n - 1): cav_f.append((off + j * n + i, off + j * n + i + 1, off + (j + 1) * n + i + 1, off + (j + 1) * n + i))
for i in range(n - 1): cav_f.append((D * n + i, D * n + i + 1, (2 * D + 1) * n + i + 1, (2 * D + 1) * n + i))
for i in (0, n - 1):
    for j in range(D): cav_f.append((j * n + i, (j + 1) * n + i, (D + 2 + j) * n + i, (D + 1 + j) * n + i))
def make_mesh(name, coords, polys, chart):
    me = bpy.data.meshes.new(name); me.from_pydata(coords, [], polys); me.update(); layer = me.uv_layers.new(name='Atlas')
    for p in me.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer.data[l].uv = au(chart, .5, .5)
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT); return ob
C_IN = np.array([0, rim[len(rim) // 2][1] + .06, MZ - .03 * W])
for i_, p_ in enumerate(cav_v):
    if i_ % n == 0 and False: pass
    pv_ = np.array(p_)
    if float(head_sdf(pv_[None])[0]) > -.003 and i_ >= n and not (i_ >= (D + 1) * n and i_ < (D + 2) * n):   # (the rim rows stay on the parting)
        lo_, hi_ = 0., 1.
        for _ in range(24):
            m_ = (lo_ + hi_) / 2; q_ = pv_ + (C_IN - pv_) * m_
            if float(head_sdf(q_[None])[0]) < -.003: hi_ = m_
            else: lo_ = m_
        cav_v[i_] = tuple(pv_ + (C_IN - pv_) * hi_)
mouth = make_mesh('Shihtzu_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bad_ = [f for f in bm.faces if f.calc_area() < 1e-10]
if bad_: bmesh.ops.delete(bm, geom=bad_, context='FACES_ONLY')
cc = Vector((0, rim[len(rim) // 2][1] + .03, MZ - .02 * W))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .045
tongue_c = np.array([0, ty, MZ - .062 * W])
ns['parts']['_tongue'] = []
tongue = ns['lobe']('Shihtzu_tongue', tongue_c, np.array([.012, .036, .066]) * W, [0, 0, 1.], '_tongue', ramp='dark', n=3, occ_in=0, pole=[1., 0, 0])
for l in tongue.data.uv_layers.active.data: l.uv = au('tongue', .5, .5)
tongue.data.materials.clear(); tongue.data.materials.append(MAT)
if tongue.data.attributes.get('cust_n') is not None: tongue.data.attributes.remove(tongue.data.attributes['cust_n'])

# ---------------------------------------------------------------- bind
def bind(o, weights):
    o.vertex_groups.clear(); groups = {b: o.vertex_groups.new(name=b) for b in HERO}
    for v, ww in zip(o.data.vertices, weights):
        pairs = sorted([(b, float(w)) for b, w in ww.items() if w > 1e-4], key=lambda t: -t[1])[:4]
        tot = sum(w for b, w in pairs); assert tot > 0, (o.name, v.index)
        quant = np.round(np.array([w / tot for b, w in pairs]) * 255).astype(int); quant[0] += 255 - int(quant.sum())
        for (b, w), qv in zip(pairs, quant):
            if qv > 0: groups[b].add([v.index], int(qv) / 255, 'REPLACE')
    for g in list(o.vertex_groups):
        if not any(any(w.group == g.index for w in v.groups) for v in o.data.vertices): o.vertex_groups.remove(g)
    for m in list(o.modifiers): o.modifiers.remove(m)
    mod = o.modifiers.new('Game skin', 'ARMATURE'); mod.object = arm; mod.use_deform_preserve_volume = False
    o.parent = arm; o.matrix_parent_inverse = Matrix.Identity(4)
objects = []
part_set = set(part_ids)
for o in base_objects:
    pp = [tuple(v.co) for v in o.data.vertices]; lab = labels[o.name]
    if o.name == 'Shihtzu_head': weights = [face_weights(p, head_kind(i, p)) for i, p in enumerate(pp)]
    elif o.name == 'Shihtzu_topknot': weights = [{'head': 1} for p in pp]
    elif o.name.startswith('Shihtzu_eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    elif o.name.startswith('Shihtzu_ear_'): weights = [ear_weights(p, o.name[-1]) for p in pp]
    elif o.name.startswith('Shihtzu_arm_'): weights = [arm_weights(p, l, o.name[-1]) for p, l in zip(pp, lab)]
    elif o.name == 'Shihtzu_tail':
        nv = len(pp); assert nv == NTL * TAIL_SIDES + 2 * (2 * TAIL_SIDES + 1), ('tail vertex layout', nv)
        for i in (0, 5 * TAIL_SIDES, (NTL - 1) * TAIL_SIDES):
            assert np.linalg.norm(np.array(pp[i]) - TP[tail_ring(i, nv)]) < .20, 'tail ring layout'
        weights = [tail_weights(tail_ring(i, nv)) for i in range(nv)]
    elif o.name == 'Shihtzu_cloak': weights = [cloak_weights(p) for p in pp]
    elif o.name == 'tome': weights = [body_weights(p, 'tome') for p in pp]
    else: weights = [body_weights(p, l) for p, l in zip(pp, lab)]
    bind(o, weights); objects.append(o)
bind(mouth, cav_w); bind(tongue, [{'jaw': 1} for v in tongue.data.vertices]); objects += [mouth, tongue]
labels['Shihtzu_mouth_cavity'] = ['mouth_cavity'] * len(mouth.data.vertices); labels['Shihtzu_tongue'] = ['tongue'] * len(tongue.data.vertices)
for o, b in lid_objects:
    bind(o, [{b: 1} for v in o.data.vertices]); objects.append(o); labels[o.name] = [b] * len(o.data.vertices)

# ---------------------------------------------------------------- the flail mount (the flail stays its own prop: public/models/shihtzu-flail.glb)
PM = json.load(open(ROOT / 'prop_mount.json', encoding='utf-8'))
mounts = {}
for t, s_ in (('R', -1), ('L', 1)):
    ad = np.array(ARMJ[t]['arm_dir']); fwd = np.array([0, -1., 0]) - ad * (ad @ np.array([0, -1., 0])); fwd /= np.linalg.norm(fwd)
    palm = np.array(ARMJ[t]['palm']); hand = np.array(P['hand_' + t])
    Zp = fwd                                              # the handle passes through the closed mitten front-to-back (thumb side forward)
    Xp = np.cross(Zp, ad); Xp /= np.linalg.norm(Xp); Yp = np.cross(Zp, Xp)
    Mg = np.array([g3(Xp), g3(Zp), g3(-Yp)]).T           # prop game axes (X, glTF up = Blender prop +Z, Z) in model game axes
    q = Matrix([list(r) for r in Mg]).to_quaternion()
    mounts['hand_' + t] = {'bone': 'hand_' + t, 'hand_head_game': g3(hand), 'palm_centre_game': g3(palm),
                           'position_in_hand_frame': g3(palm - hand), 'quaternion_xyzw': [round(q.x, 6), round(q.y, 6), round(q.z, 6), round(q.w, 6)],
                           'handle_axis_game': g3(Zp), 'arm_dir_game': g3(ad)}
GRIP_R, GRIP_L = -.050, .055                              # two-handed: the right paw low on the bone handle, the left above it
chain = [{'object': c['object'], 'parent': c['parent'], 'pivot_prop_game': [0., round(c['pivot_blender'][2], 4), 0.]} for c in PM['chain']]
FLAIL = {'units': 'metres; game axes [x, y, z] = Blender [x, z, -y]; the game rebuilds bones without rotation, so a bone frame = the model frame translated to the bone head',
         'prop': '/models/shihtzu-flail.glb', 'prop_frame': 'the grip centre on the bone handle at the origin; the handle -> rope -> ball along the prop +Y (glTF up)',
         'one_handed': {'hand': 'R', **mounts['hand_R'], 'prop_point_at_palm': [0, 0, 0]},
         'left_hand': mounts['hand_L'],
         'two_handed': {'right_palm_on_prop': [0, GRIP_R, 0], 'left_palm_on_prop': [0, GRIP_L, 0],
                        'note': 'put the prop so its +Y passes through both palms: right palm at prop y %+.3f, left at %+.3f (game prop axes)' % (GRIP_R, GRIP_L)},
         'chain_rest_pivots': chain, 'ball_centre_prop_game': [0., round(PM['head_centre_blender'][2], 4), 0.],
         'ball_diameter_m': PM['ball_diameter_m'], 'rope_length_m': PM['rope_length_m'], 'glow_material': PM['glow_material']}
(ROOT / 'export' / 'prop_mount.json').write_text(json.dumps(FLAIL, indent=2))

# ---------------------------------------------------------------- checks and save
total = 0
for o in objects:
    o.data.calc_loop_triangles(); total += len(o.data.loop_triangles)
    assert len(o.modifiers) == 1 and o.modifiers[0].type == 'ARMATURE', o.name
    for v in o.data.vertices: assert 1 <= len(v.groups) <= 4 and abs(sum(g.weight for g in v.groups) - 1) < 1e-6, (o.name, v.index)
print('TRI_TOTAL', total, flush=True); assert total <= 34000, total
hidden = {}
for o, bname in lid_objects:
    piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
    for ang in ([0.0] if bname.startswith('lidU') else [0.0, -.10]):
        Vr = rot_axis(V, piv, hinge(bname[-1]), ang)
        sd = head_sdf(Vr); hidden[f'{o.name}@{ang}'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
for o in (mouth, tongue):
    sd = head_sdf(np.array([list(v.co) for v in o.data.vertices]))
    hidden[o.name + '@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
print('HIDDEN', json.dumps(hidden), flush=True)
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'shihtzu-toy_rig.blend'))
(ROOT / 'rig-part-labels.json').write_text(json.dumps({o.name: labels[o.name] for o in objects}))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]], 'head_game_m': g3(P[b])} for b in HERO],
       'triangles': total, 'lids': lid_info, 'lids_hidden_check': hidden, 'squint_designed_for': [SQ_U, SQ_D],
       'lidTilt': LID_TILT, 'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'},
       'lid_hinge_game': {t: g3(hinge(t)) for t in 'LR'},
       'flail_mount': FLAIL, 'mouth': {'parting_vertices': len(part_ids), 'split_vertices': len(dup_of), 'cavity_rim_points': len(rim)},
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids are surfaces of revolution about their bone X axis: a rotation slides them along themselves.',
                 'The mouth parting was cut in the model (round 4); the lower copies are 100% jaw-side, the corners shared (sealed).',
                 'Weights quantized to an exact 255 sum; <= 4 influences. Topknot rigid to head; ear locks: head (merged top) -> ear -> earTip (lobes).',
                 'The flail is not part of the hero: public/models/shihtzu-flail.glb at export/prop_mount.json.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2))
print('SHIHTZU_RIG', json.dumps({'bones': len(HERO), 'triangles': total, 'lids': {k: v['pivot_offset_m'] for k, v in lid_info.items()}}), flush=True)
