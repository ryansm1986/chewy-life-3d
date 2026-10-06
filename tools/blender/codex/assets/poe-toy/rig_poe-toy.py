"""Poe (poe-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, world-axis game contract.

    blender --background --factory-startup --python rig_poe-toy.py

Runs build_poe-toy.py in RIG_MODE (part labels; lid / cavity / tongue charts in unused atlas space; the approved GLB,
blend and json files are not touched), then adds (after Moka's and Rosie's rigs):
  - the armature (exactly the hero contract, identity rest orientations, heads at the joints);
  - the mouth: the skin parted along the painted W mouth between sealed corners, a closed cavity and a tongue;
  - eyelids: rigid shells that are surfaces of revolution about their bone's X axis, just outside the eyeball, in the coat;
  - weights (spatial fields + part labels, <= 4 influences, quantized to an exact 255 sum);
  - the fuma prop: kept OUT of the hero (no Armature modifier); exported on its own as public/models/poe-fuma.glb
    (pivot at the hub, arms in its XY plane, spin axis +Z) with export/fuma_mount.json;
and saves poe-toy_rig.blend (only Armature modifiers left), joints-rig.json and rig-part-labels.json.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'build_poe-toy.py').read_text(encoding='utf-8')
ns = {'__file__': str(ROOT / 'build_poe-toy.py'), '__name__': 'poe_model', 'RIG_MODE': True}
exec(compile(src, str(ROOT / 'build_poe-toy.py'), 'exec'), ns)
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MZ, MHW = ns['MZ'], ns['MHW']
smooth, au, MAT, M2L = ns['smooth'], ns['au'], ns['MAT'], ns['M2L']
head_sdf, front_hit = ns['head_sdf'], ns['front_hit']
NOSE_TIP_L = ns['NOSE_TIP_L']
def sm(a, b, x): return float(smooth(a, b, x))
FUMA_PROP = 'D:/projects/chewy-life-3d/public/models/poe-fuma.glb'
os.makedirs(ROOT / 'export', exist_ok=True)

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
fuma = OBJ.pop('fuma_back'); base_objects = [o for o in base_objects if o is not fuma]

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
JB = ns['JOINTS_BODY']
ARM = {s: {'upperarm': tuple(JB['arms'][t]['shoulder']), 'forearm': tuple(JB['arms'][t]['elbow']), 'hand': tuple(JB['arms'][t]['wrist'])}
       for s, t in ((1, 'L'), (-1, 'R'))}
LEG = {s: {'thigh': (s * .125, .004, .335), 'shin': (s * .195, -.004, .205), 'foot': (s * .208, -.004, .100)} for s in (1, -1)}
def smile_z(x):     # the painted W mouth (paint_head's lobes): the cusp at the centre, the corners curling up
    t = min(max((abs(x) - .004 * W) / (MHW - .004 * W), 0.), 1.)
    return MZ + .008 * W - .030 * W * math.sin(math.pi * t) ** 1.05 + .026 * W * t ** 3.2
neck_c = ns['L2M'](np.array(ns['NECK'][0]))
mouth_y = float(front_hit(0., MZ)[0]); corner_z = smile_z(MHW)
P = {'root': (0, -.010, 0), 'hips': tuple(JB['hips']), 'spine': tuple(JB['spine']), 'chest': tuple(JB['chest']),
     'neck': tuple(JB['neck']),
     'head': (0, float(neck_c[1]) + .045, CHIN + .001),                     # skull base: the nod pivot at the back of the neck
     'jaw': (0, mouth_y + .22 * W, corner_z)}                             # the hinge inside the head, 0.22 W behind the smile
BROW_Z = CHIN + .470 * W
EAR_PIV = (.020, -.150); TIP_PIV = (-.045, -.100)          # (dy, dz) from the root / fold point
LEFT_EAR_K = .12      # the left ear under the festival mask: any flip-up of the full ear enters the mask (pose-check.json)
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * EX, float(front_hit(s * EX, BROW_Z)[0]) + .012, BROW_Z)
    P['lip_' + tag] = (s * MHW, float(front_hit(s * MHW, corner_z)[0]) + .002, corner_z)
    # Poe's button ear hugs the ball skull and its fold runs front-to-back, so a game hinge about X at the root / fold
    # see-saws one end of the ear into the skull. Both pivots sit under the ear (same x), moved in along the skull's radius
    # so the rotations glide over the ball (measured in scratch/ear_opt3.py; see the report):
    b_ = np.array(ns['ear_info'][tag]['base']); f_ = np.array(ns['ear_info'][tag]['fold'])
    P['ear_' + tag] = (float(b_[0]), float(b_[1]) + EAR_PIV[0], float(b_[2]) + EAR_PIV[1])        # under the root, near the skull centre
    P['earTip_' + tag] = (float(f_[0]), float(f_[1]) + TIP_PIV[0], float(f_[2]) + TIP_PIV[1])    # under the fold
    for k, v in ARM[s].items(): P[k + '_' + tag] = v
    for k, v in LEG[s].items(): P[k + '_' + tag] = v
TP = np.array(ns['TAIL_PATH']); TAIL_IDX = [0, 5, 11, 17]
for i in range(4): P['tail%d' % (i + 1)] = tuple(float(c) for c in TP[TAIL_IDX[i]])

# ---------------------------------------------------------------- BVHs of the approved skin and eyes
head = OBJ['Poe_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Poe_eye_' + t].data.vertices],
                                    [tuple(p.vertices) for p in OBJ['Poe_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
def front_y(x, z, tag):
    a = ray_y(eye_tree[tag], x, z); b = ray_y(skin_tree, x, z)
    c = [v for v in (a, b) if v is not None]; return min(c) if c else None

# ---------------------------------------------------------------- eyelids: rigid shells about the bone X axis (Moka / Rosie construction)
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
ROWS_U = [0, .015, .03, .045, .06, .09, .12, .155, .20, .26, .33, .42, .53, .66, .82, 1.0]     # dense at the lash edge (round 4b)
ROWS_D = [0, .04, .10, .18, .30, .46, .66, 1.0]
lid_info = {}; lid_objects = []; LID_PAINT = {}
SQ_U = float(os.environ.get('SQ_U', '.58'))       # the happy squint the lid is designed for: the game's squint[0] (poeToy: [0.58, -0.24])
RIM_N = {}; LID_NRING = 1.02
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
CL_N0, CL_N1 = 1.06, 1.18           # closed lid: face normals out to the socket lip, then the skin's own
FACE_IN = float(os.environ.get('FACE_IN', '.0005'))    # the closed lid sits this far inside the face without the eye recess
LID_FACE = os.environ.get('LID_FACE', '1') == '1'
OV_IN = .0060; OV_MID = .0030                          # closed edge below the opening's lower outline (inner corner / elsewhere)
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
    Xs = np.linspace(-1.14, 1.14, 23) if upper else np.linspace(-.88, .88, 19)        # past both corners: Poe's lash band is thick at the top-outer
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
    target = 1.22 if upper else -.24
    if upper:
        # round 4b: every column's closed edge lands just below the opening's lower outline, so the closed lid's lash edge
        # traces the eye's U (before, the inner half closed a flat line 2-12 cm under the outline, hidden by the skin)
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
            pe = PE[i]; pt = ang(outline_z(X, True) + EHH * .34, r0) + .45; phT = ang(outline_z(X, True), r0)
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
            if LID_FACE:                # the closed lid's edge strip lies on the socket's lower lip, so its lash shows
                phR = ang(outline_z(X, False), r0)
                if abs(X) <= .95: rr = [(max(r, sk_ - .0004) if ph < phR - .012 else max(r, sk_ + .0008)) if ph < phR + .02 else r for r, ph, sk_ in zip(rr, phs, sk)]
            sq = 1.22 - SQ_U
            sk_sq = skin_dist(x, pivot, [ph + sq for ph in phs]); ed = eye_dist(x, pivot, phs, tag)
            rr = [min(r, max(sk_ - .0025, e_ + .0008)) if (ph + sq > phT - .04 and ph < phT - .06) else r
                  for r, ph, sk_, e_ in zip(rr, phs, sk_sq, ed)]
            rr = [max(r, e_ + (.0016 if t_ < .08 else .0008)) for r, e_, t_ in zip(rr, ed, rows)]   # never inside the eyeball when closed
            if abs(X) > .95:            # the corner columns: wherever a row sits outside the opening at the squint, it hides in the skin
                for k_, ph in enumerate(phs):
                    zs_ = zp + rr[k_] * math.sin(ph + sq)
                    if float(np.asarray(ns['eye_s'](1 if tag == 'L' else -1, x, zs_)[0])) > 1.0:
                        rr[k_] = max(min(rr[k_], sk_sq[k_] - .0025), ed[k_] + .0008)
                    zc_ = zp + rr[k_] * math.sin(ph)                 # closing wins: rows over the opening's corner stay on the skin
                    if float(np.asarray(ns['eye_s'](1 if tag == 'L' else -1, x, zc_)[0])) < 1.05:
                        rr[k_] = max(rr[k_], sk[k_] + .0004)
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
    nr = len(rows); fs = []
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
        closure = (closure, coverage, max(dev) if dev else 0)
    paint = {'G': np.array(G), 'arc': np.array(ARC), 'X': np.array([c[0] for c in cols]), 'rows': np.array(rows), 'dark': np.array(DARK), 'rim_arc': np.array(RIMA), 'hspan': np.array(HSPAN)}
    return V, UVs, fs, pivot, out_cols, target, NRM, closure, paint
def rest_exposure(V, pivot, angs):
    V = np.array(V); worst = -9.
    for a in angs:
        c, s_ = math.cos(a), math.sin(a); d = V - pivot
        Vr = np.stack([d[:, 0], d[:, 1] * c - d[:, 2] * s_, d[:, 1] * s_ + d[:, 2] * c], -1) + pivot
        worst = max(worst, float(head_sdf(Vr).max()))
    return worst
def lid_shell(tag, upper):
    angs = [0.0] if upper else [0.0, -.10]
    cands = np.array([.095, .105, .115, .125, .135, .150, .170, .190]) if upper else np.linspace(0, .32, 17)
    best = None
    for dz in cands:
        try:
            g = lid_geometry(tag, upper, float(dz))
        except (ValueError, TypeError, ZeroDivisionError):
            continue
        e = rest_exposure(g[0], g[3], angs)
        if upper:
            e = (0 if e < -.0005 else 1 + e * 100) + (0 if g[7][0] <= 0 else 1 + g[7][0] * 100) + abs(g[7][1] - .28) + 4 * g[7][2]
        else:
            e = (0 if e < -.0002 else 1 + e * 100) + .05 * dz
        if best is None or e < best[0]: best = (e, float(dz), g)
    e, dz, (V, UVs, fs, pivot, cols, target, NRM, closure, paint) = best
    chart = 'lidU' if upper else 'lidD'
    if tag == 'L': LID_PAINT[chart] = paint
    name = ('Poe_lidU_' if upper else 'Poe_lidD_') + tag
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], fs); me.update()
    layer = me.uv_layers.new(name='Atlas')
    for p in me.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer.data[l].uv = au(chart, UVs[me.loops[l].vertex_index][1], UVs[me.loops[l].vertex_index][0])   # transposed chart
    bm = bmesh.new(); bm.from_mesh(me); yp, zp = pivot[1], pivot[2]
    for f in bm.faces:
        c = f.calc_center_median()
        if f.normal.dot(Vector((0, c.y - yp, c.z - zp))) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
    me.normals_split_custom_set([tuple(NRM[me.loops[l].vertex_index]) for l in range(len(me.loops))])
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT)
    lid_objects.append((ob, ('lidU_' if upper else 'lidD_') + tag))
    lid_info[name] = {'pivot': [float(v) for v in pivot], 'pivot_offset_m': dz, 'score': round(e, 4),
                      'closed_edge_above_rim_mm': None if closure is None else round(closure[0] * 1000, 2),
                      'squint_coverage': None if closure is None else round(closure[1], 3),
                      'closed_standoff_centre_mm': None if closure is None else round(closure[2] * 1000, 2), 'target': target}
    print('LID', name, json.dumps(lid_info[name]), flush=True)
    return tuple(float(v) for v in pivot)
LIDS_ONLY = bool(os.environ.get('LIDS_ONLY'))
for tag in (('L',) if LIDS_ONLY else 'LR'):
    P['lidU_' + tag] = lid_shell(tag, True)
    P['lidD_' + tag] = lid_shell(tag, False)

RING_K = 1.10
LASH_T = float(os.environ.get('LASH_T', '.0140')); LASH_WING = float(os.environ.get('LASH_WING', '.0045'))
def paint_lids():
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    w_, h_ = img.size; px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    rgb, mix = ns['rgb'], ns['mix']
    for chart, info in LID_PAINT.items():
        x0, y0, w, h = ns['CHARTS'][chart]
        Vv, U = np.meshgrid(np.clip((np.arange(w) - 6) / (w - 12), 0, 1), np.clip((np.arange(h) - 6) / (h - 12), 0, 1))   # transposed
        G = info['G']; A = info['arc']; rows = info['rows']; nc = G.shape[0]
        fi = U * (nc - 1); i0 = np.clip(np.floor(fi).astype(int), 0, nc - 2); a = fi - i0
        j0 = np.clip(np.searchsorted(rows, Vv, side='right') - 1, 0, len(rows) - 2); b = (Vv - rows[j0]) / (rows[j0 + 1] - rows[j0])
        def bil(F):
            F = np.asarray(F); e = (Ellipsis,) + (None,) * (F.ndim - 2)
            return (F[i0, j0] * ((1 - a) * (1 - b))[e] + F[i0 + 1, j0] * (a * (1 - b))[e]
                    + F[i0, j0 + 1] * ((1 - a) * b)[e] + F[i0 + 1, j0 + 1] * (a * b)[e])
        Pp = bil(G).reshape(-1, 3); arc = bil(A)
        d = Pp - ns['O']; d /= np.linalg.norm(d, axis=1, keepdims=True)
        uv = ns['head_uv'](d)
        ns['PAINT_OPTS']['band'] = False; ns['PAINT_OPTS']['blush'] = False
        C = np.asarray(ns['paint_head'](uv[:, 0], uv[:, 1])).reshape(h, w, 3)
        # over the opening: exactly her surrounding coat (Shepard 1/d^3 from the skin's paint on a ring just outside the rim)
        psr = np.linspace(0, 2 * math.pi, 96, endpoint=False); rx, rz = ns['eye_xz'](1, psr, RING_K)
        ry = front_hit(rx, rz); rd = np.stack([rx, ry, rz], -1) - ns['O']; rd /= np.linalg.norm(rd, axis=1, keepdims=True)
        ruv = ns['head_uv'](rd); RC = np.asarray(ns['paint_head'](ruv[:, 0], ruv[:, 1])).reshape(-1, 3)
        ns['PAINT_OPTS']['band'] = True; ns['PAINT_OPTS']['blush'] = True
        d2 = (Pp[:, 0, None] - rx[None]) ** 2 + (Pp[:, 2, None] - rz[None]) ** 2; wr = 1 / (d2 + 1e-7) ** 1.5
        CS = ((wr[..., None] * RC[None]).sum(1) / wr.sum(1)[:, None]).reshape(h, w, 3)
        srp = ns['eye_s'](1, Pp[:, 0], Pp[:, 2])[0].reshape(h, w)
        C = CS                                                                    # one smooth coat field over the whole lid
        if chart == 'lidU':
            col = lambda k: info[k][i0] * (1 - a) + info[k][i0 + 1] * a
            dk, ra, hs = col('dark'), col('rim_arc'), col('hspan')
            pv = np.array(P['lidU_L']); dq = 1.22 - SQ_U; c_, s_ = math.cos(dq), math.sin(dq)
            dy, dz_ = Pp[:, 1] - pv[1], Pp[:, 2] - pv[2]
            Psq = np.stack([Pp[:, 0], pv[1] + dy * c_ + dz_ * s_, pv[2] + dz_ * c_ - dy * s_], -1)
            dq_ = Psq - ns['O']; dq_ /= np.linalg.norm(dq_, axis=1, keepdims=True); uvq = ns['head_uv'](dq_)
            ns['PAINT_OPTS']['blush'] = False
            Cq = np.asarray(ns['paint_head'](uvq[:, 0], uvq[:, 1])).reshape(h, w, 3)
            ns['PAINT_OPTS']['blush'] = True
            srq, _a, _X, Znq = ns['eye_s'](1, Psq[:, 0], Psq[:, 2])
            hid_b = smooth(-.0004, -.0016, head_sdf(Pp)).reshape(h, w)
            wq = hid_b * (smooth(.885, .92, srq) * smooth(0, .2, Znq)).reshape(h, w)
            C = mix(C, Cq, wq)
            Xt = info['X'][i0] * (1 - a) + info['X'][i0 + 1] * a
            T_ = (LASH_T * (.45 + .55 * smooth(-.95, -.40, Xt)) * smooth(-1.0, -.88, Xt) + LASH_WING * smooth(.55, 1.0, Xt)) * (1 - smooth(.99, 1.07, Xt))
            lash_ = 1 - smooth(T_ - .0007, T_ + .0007, arc)
            C = mix(C, rgb('#141216'), lash_)                                       # the closed-eye lash: one soft U on the lid's edge
        else:
            C = mix(C, rgb('#221D24'), .70 * np.exp(-((arc - .0012) / .0014) ** 2))
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'poe-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()
if LIDS_ONLY:
    for ob, bn in lid_objects: ob['pivot'] = list(P[bn])
    print('RECESS', json.dumps({'%+.1f,%+.2f' % (X_, Z_): [round(float(front_hit(np.array([EX + EHW * X_]), np.array([EZ + EHH * Z_]), f=head_sdf_nr)[0]), 4),
                                round(float(front_y(EX + EHW * X_, EZ + EHH * Z_, 'L') or 9), 4)] for X_ in (-.8, -.4, 0, .4, .8) for Z_ in (-.8, 0, .8)}), flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'scratch' / os.environ.get('LIDS_BLEND', 'lidtest.blend')))
    print('LIDS_ONLY_DONE', flush=True); import sys as _s; _s.exit(0)

# ---------------------------------------------------------------- mouth: part the skin along the W line, add the cavity
CUT = .94 * MHW
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Poe_head']; uvl = old.uv_layers.active.data
verts = []; vlab = []; vkind = []; faces = []; fuv = []; fno = []; cache = {}; seam = []
def addv(rec, kind):
    co, uv, no, lab = rec
    if kind is None: kind = 'lower' if (lab == 'ball_head_skin' and co.z < smile_z(co.x) and abs(co.x) < CUT and co.y < HY - .10) else 'upper'
    key = (tuple(round(float(c), 7) for c in co), tuple(round(float(c), 6) for c in uv), tuple(round(float(c), 4) for c in no), lab, kind)
    if key not in cache:
        cache[key] = len(verts); verts.append(tuple(co)); vlab.append(lab); vkind.append(kind)
    return cache[key]
def emit(recs, kind):
    if len(recs) < 3: return
    for k in range(1, len(recs) - 1):
        rr = [recs[0], recs[k], recs[k + 1]]
        if (rr[1][0] - rr[0][0]).cross(rr[2][0] - rr[0][0]).length < 1e-12: continue
        ids = [addv(r, kind) for r in rr]
        faces.append(ids); fuv.append([tuple(r[1]) for r in rr]); fno.append([tuple(r[2]) for r in rr])
def clip(recs, keep_upper):
    out = []
    for i, a in enumerate(recs):
        b = recs[(i + 1) % len(recs)]; fa = a[0].z - smile_z(a[0].x); fb = b[0].z - smile_z(b[0].x)
        ia = fa >= 0 if keep_upper else fa <= 0; ib = fb >= 0 if keep_upper else fb <= 0
        if ia: out.append(a)
        if ia != ib:
            t = fa / (fa - fb); r = (a[0].lerp(b[0], t), a[1].lerp(b[1], t), a[2].lerp(b[2], t).normalized(), a[3]); out.append(r)
            if keep_upper: seam.append(tuple(r[0]))
    return out
for tr in old.loop_triangles:
    rr = [(old.vertices[old.loops[l].vertex_index].co.copy(), uvl[l].uv.copy(), cn[l].copy(), oldlab[old.loops[l].vertex_index]) for l in tr.loops]
    f = [r[0].z - smile_z(r[0].x) for r in rr]
    skin = rr[0][3] == 'ball_head_skin'
    cut = skin and max(r[0].y for r in rr) < HY - .10 and max(abs(r[0].x) for r in rr) < CUT and min(f) < 0 < max(f)
    if cut: emit(clip(rr, True), 'upper'); emit(clip(rr, False), 'lower')
    else: emit(rr, None)
me = bpy.data.meshes.new('Poe_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, u in zip(poly.loop_indices, uu): layer.data[l].uv = u
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < .0003) & np.array([l_ == 'ball_head_skin' for l_ in FL])
FN[onsk] = ns['grad_n'](FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Poe_head'] = vlab
seam = sorted(set(tuple(round(c, 7) for c in p) for p in seam), key=lambda p: p[0])
rim = []
for p in seam:
    if not rim or p[0] - rim[-1][0] > .0016: rim.append(p)
assert len(rim) >= 10, len(rim)

# ---------------------------------------------------------------- weights
def lip_w(x, z):
    return .85 * math.exp(-((abs(x) - MHW) / (.034 * W)) ** 2 - ((z - corner_z) / (.034 * W)) ** 2)
def jaw_w(x, y, z, kind):
    q = M2L(np.array([x, y, z])); xl, yl, zl = q; b = yl - NOSE_TIP_L
    sharp = 1.0 if kind == 'lower' else 0.0
    field = 1 - sm(-.006 * W, .010 * W, z - smile_z(x))
    we = sm(.74 * CUT, CUT, abs(x)); below = sharp * (1 - we) + field * we
    lat = 1 - sm(.15, .29, abs(xl)); back = 1 - sm(.40, .58, b)          # the lower lip band and chin, a soft falloff into the jowls
    return below * lat * back * (1 - sm(.19, .26, zl))
def face_weights(p, lab, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab != 'ball_head_skin': return {'head': 1}
    q = M2L(np.array(p)); zl = q[2]; b = q[1] - NOSE_TIP_L
    lip = lip_w(x, z) * (1 - sm(-.22, -.12, y - HY))
    jw = jaw_w(x, y, z, kind)
    neck = sm(-.02, -.11, zl) * sm(.40, .55, b)
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
EAR_KD = {}
for t_ in 'LR':
    gp, gv = ns['EAR_GRID'][t_]; kd = KDTree(len(gp))
    for i_, p_ in enumerate(gp): kd.insert(Vector(p_), i_)
    kd.balance(); EAR_KD[t_] = (kd, gv)
def ear_weights(p, side):
    kd, gv = EAR_KD[side]; co, idx, dist = kd.find(Vector(p)); v = float(gv[idx])
    hd = 1 - sm(.0, .10, v)                         # the buried root follows the head
    py = P['earTip_' + side][1]
    tip = sm(.12, .30, v) * (1 - sm(py - .04, py + .04, p[1]))   # the front flap beyond the fold swings on earTip; the rear stays on ear_
    k = LEFT_EAR_K if side == 'L' else 1.          # the mask's cord holds the left ear down: it moves at a fraction of the right
    mv = (1 - hd) * k
    return {'head': 1 - mv, 'ear_' + side: mv * (1 - tip), 'earTip_' + side: mv * tip}
def side_of(lab, x):
    if lab.endswith(('.L', 'L')) and not lab.endswith('.R'): return 'L' if lab.endswith('.L') else ('L' if x >= 0 else 'R')
    if lab.endswith('.R'): return 'R'
    return 'L' if x >= 0 else 'R'
def torso(z):                                       # hips / spine / chest along the torso (the sash band moves with the top)
    h_ = 1 - sm(.40, .50, z); c_ = sm(.53, .62, z); return h_, (1 - h_) * (1 - c_), (1 - h_) * c_
def arm_t(p, s):
    sh = np.array(ARM[s]['upperarm']); wr_ = np.array(ARM[s]['hand']); d = wr_ - sh
    return float((np.array(p) - sh) @ d / (d @ d))
def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'; s_ = 1 if side == 'L' else -1
    if lab == 'moss_wrapped_top' or lab == 'cream_chest_strap':
        h_, sp_, c_ = torso(z)
        arm = .32 * sm(.21, .27, abs(x)) * sm(.55, .61, z)                     # the shoulders lift with the sleeves
        return {'hips': h_, 'spine': sp_, 'chest': c_ * (1 - arm), 'upperarm_' + side: c_ * arm}
    if lab in ('cream_collar_roll', 'moss_hood_cowl'):
        nk = .35 + .30 * sm(.62, .70, z); return {'neck': nk, 'chest': 1 - nk}
    if lab == 'mustard_scarf_band': return {'chest': .75, 'neck': .25}
    if lab in ('scarf_knot', 'scarf_knot_loop'): return {'chest': 1}
    if lab.startswith('scarf_tail'):
        sp_ = .40 * sm(.56, .47, z); return {'chest': 1 - sp_, 'spine': sp_}
    if lab in ('mustard_obi_sash', 'sash_knot') or lab.startswith('sash_loop'):
        h_, sp_, c_ = torso(z); return {'hips': h_ + c_, 'spine': sp_}
    if lab.startswith('sash_tail'):
        t_ = 'L' if lab.endswith('L') else 'R'; th = .45 * sm(.40, .25, z)
        return {'hips': 1 - th, 'thigh_' + t_: th}
    if lab.startswith('dmoss_puffy_shorts'):
        t_ = lab[-1]; hp = .85 * sm(.30, .40, z); seat = .25 * sm(.05, .20, y) * sm(.22, .32, z) * (1 - hp)
        shin = .45 * sm(.215, .165, z)
        rest = 1 - hp - seat
        return {'hips': hp + seat, 'thigh_' + t_: rest * (1 - shin), 'shin_' + t_: rest * shin}
    if lab.startswith('cream_shin_wrap'):
        t_ = lab[-1]; ft = .30 * sm(.115, .095, z); th = .25 * sm(.17, .19, z)
        return {'shin_' + t_: 1 - ft - th, 'foot_' + t_: ft, 'thigh_' + t_: th}
    if lab.startswith(('moss_tabi_boot', 'mustard_sole', 'cream_tabi_strap')):
        t_ = lab[-1]; sh = .30 * sm(.090, .112, z); return {'foot_' + t_: 1 - sh, 'shin_' + t_: sh}
    if lab.startswith(('dmoss_pouch', 'pouch_', 'mini_bone_shuriken', 'mini_hub', 'cream_scroll', 'brown_scroll', 'mustard_scroll', 'scroll_tie')):
        return {'hips': 1}
    if lab == 'mustard_fuma_strap': return {'chest': 1}
    return {'spine': 1}
def arm_weights(p, lab, t_):
    s_ = 1 if t_ == 'L' else -1; t = arm_t(p, s_)
    if lab.startswith('black_mitten_paw'):
        fore = 1 - sm(.255, .30, t); return {'hand_' + t_: 1 - fore, 'forearm_' + t_: fore}     # the mitten is rigid; its wrist blends
    if lab.startswith(('moss_sleeve', 'cream_cuff', 'mustard_cuff')):
        chest = .30 * (1 - sm(-.03, .05, t)); return {'chest': chest, 'upperarm_' + t_: 1 - chest}
    if lab.startswith(('dmoss_forearm_guard', 'mustard_guard_band')):
        up = .5 * (1 - sm(.14, .19, t)); return {'upperarm_' + t_: up, 'forearm_' + t_: 1 - up}
    return {'upperarm_' + t_: 1}
TPATH = TP; TCUM = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(TPATH, axis=0), axis=1))]); TS = TCUM / TCUM[-1]
TB_S = TS[TAIL_IDX] if False else np.array([TS[i] for i in TAIL_IDX])
def tail_weights(p):
    d = np.linalg.norm(TPATH - np.array(p), axis=1); k = int(np.argmin(d)); s = TS[k]
    hips = 1 - sm(.0, .10, s)
    w = {}
    for i in range(4):
        a = TB_S[i]; b = TB_S[i + 1] if i < 3 else 1.01
        w['tail%d' % (i + 1)] = 0.
    # piecewise-linear blends between the joints (each vertex goes to its segment's bone, blending into the next)
    for i in range(4):
        a = TB_S[i]; b = TB_S[i + 1] if i < 3 else 1.01
        if a <= s < b:
            f = (s - a) / (b - a); blend = sm(.70, 1.0, f) if i < 3 else 0.
            w['tail%d' % (i + 1)] = 1 - blend
            if i < 3: w['tail%d' % (i + 2)] = blend
    tot = sum(w.values()) or 1.
    swing = (1 - hips) * sm(.255, .345, p[1])
    w = {k: v / tot * swing for k, v in w.items()}; w['hips'] = 1 - swing
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
adata = bpy.data.armatures.new('Poe_game_skeleton'); arm = bpy.data.objects.new('Poe_Rig', adata); bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in HERO:
    b = adata.edit_bones.new(name); b.head = P[name]; b.tail = Vector(P[name]) + Vector((0, .04, 0)); b.roll = 0
    if PARENT[name]: b.parent = adata.edit_bones[PARENT[name]]
    b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for b in arm.pose.bones: b.rotation_mode = 'YZX'
arm.show_in_front = True

# ---------------------------------------------------------------- the mouth cavity and tongue
def skin_front(x, z):
    y = ray_y(skin_tree, x, z); return y if y is not None else float(front_hit(x, z)[0])
cav_v = []; cav_w = []; cav_f = []; D = 3; n = len(rim)
for level in ('upper', 'lower'):
    for j in range(D + 1):
        t = j / D
        for x, y, z in rim:
            corner = 1 - sm(.74 * CUT, CUT, abs(x))
            pz = z + (.010 * W if level == 'upper' else -.050 * W) * math.sin(t * math.pi * .5) * corner
            py = y + .0015 + .095 * W * t * (.35 + .65 * corner)
            px = x * (1 - .06 * t)
            if j: py = max(py, skin_front(px, pz) + .005)
            cav_v.append((px, py, pz))
            ww = face_weights((x, y, z), 'ball_head_skin', level)
            sd = 'L' if x >= 0 else 'R'
            if level == 'upper': ww = {'head': 1 - ww['lip_' + sd], 'lip_' + sd: ww['lip_' + sd]}
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
mouth = make_mesh('Poe_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bad_ = [f for f in bm.faces if f.calc_area() < 1e-10]
if bad_: bmesh.ops.delete(bm, geom=bad_, context='FACES_ONLY')
cc = Vector((0, rim[len(rim) // 2][1] + .03, MZ))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .058
tongue_c = np.array([0, ty, MZ - .038 * W])
ns['parts']['head'] = []
tongue = ns['lobe']('Poe_tongue', tongue_c, np.array([.012, .042, .058]) * W, [0, 0, 1.], 'head', ramp='dark', n=3, occ_in=0, pole=[1., 0, 0])
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
for o in base_objects:
    pp = [tuple(v.co) for v in o.data.vertices]; lab = labels[o.name]
    if o.name == 'Poe_head': weights = [face_weights(p, l, k) for p, l, k in zip(pp, lab, vkind)]
    elif o.name == 'Poe_mask': weights = [{'head': 1} for p in pp]
    elif o.name.startswith('Poe_eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    elif o.name.startswith('Poe_ear_'): weights = [ear_weights(p, o.name[-1]) for p in pp]
    elif o.name.startswith('Poe_arm_'): weights = [arm_weights(p, l, o.name[-1]) for p, l in zip(pp, lab)]
    elif o.name == 'Poe_tail': weights = [tail_weights(p) for p in pp]
    else: weights = [body_weights(p, l) for p, l in zip(pp, lab)]
    bind(o, weights); objects.append(o)
bind(mouth, cav_w); bind(tongue, [{'jaw': 1} for v in tongue.data.vertices]); objects += [mouth, tongue]
labels['Poe_mouth_cavity'] = ['mouth_cavity'] * len(mouth.data.vertices); labels['Poe_tongue'] = ['tongue'] * len(tongue.data.vertices)
for o, b in lid_objects:
    bind(o, [{b: 1} for v in o.data.vertices]); objects.append(o); labels[o.name] = [b] * len(o.data.vertices)

# ---------------------------------------------------------------- the fuma prop (out of the hero; its own GLB, pivot at the hub)
FCt = np.array(ns['FCt']); fx, fy, fz = (np.array(ns[k]) for k in ('fx', 'fy', 'fz'))
for m in list(fuma.modifiers): fuma.modifiers.remove(m)
fuma.vertex_groups.clear(); fuma.parent = None
fuma['note'] = 'the back-mounted fuma: not skinned (kept out of the hero export); the game shows public/models/poe-fuma.glb at the mount'
def g3(v): v = np.asarray(v, float); return [round(float(v[0]), 5), round(float(v[2]), 5), round(float(-v[1]), 5)]
R_local = np.array([fx, fy, fz]).T                                   # prop local (X right, Y up-on-the-back, Z spin axis) -> model
def export_fuma_prop():
    me = fuma.data.copy(); me.name = 'poe_fuma_prop'
    Vb = np.array([list(v.co) for v in me.vertices]); Vl = (Vb - FCt) @ R_local      # hub at the origin, arms in XY, spin +Z
    for v, c in zip(me.vertices, Vl): v.co = Vector(c)
    cn_ = np.array([list(l.vector) for l in fuma.data.corner_normals]) @ R_local
    me.normals_split_custom_set([tuple(c) for c in cn_])
    # its own small material: the ramp region of the atlas only (bone, mustard, rivet ramps), UVs remapped to it
    rx0, ry0, rw, rh = ns['CHARTS']['ramp']
    src_img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    px = np.empty(src_img.size[0] * src_img.size[1] * 4, np.float32); src_img.pixels.foreach_get(px); px = px.reshape(src_img.size[1], src_img.size[0], 4)
    sub = px[ry0:ry0 + rh, rx0:rx0 + rw].copy()
    img = bpy.data.images.new('poe_fuma_paint', rw, rh); img.pixels.foreach_set(sub.ravel())
    img.filepath_raw = str(ROOT / 'scratch' / 'poe_fuma_paint.png'); img.file_format = 'PNG'; img.save(); img.pack()
    uvd = me.uv_layers.active.data; U = np.array([list(l.uv) for l in uvd])
    assert ((U[:, 0] * 2048 >= rx0 - 1) & (U[:, 0] * 2048 <= rx0 + rw + 1) & (U[:, 1] * 2048 >= ry0 - 1) & (U[:, 1] * 2048 <= ry0 + rh + 1)).all(), 'fuma uv outside the ramp chart'
    for l, u in zip(uvd, U): l.uv = ((u[0] * 2048 - rx0) / rw, (u[1] * 2048 - ry0) / rh)
    mat = bpy.data.materials.new('Poe_fuma_paint'); mat.use_nodes = True
    bs = mat.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = .8; bs.inputs['Metallic'].default_value = 0
    tx = mat.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'
    mat.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
    me.materials.clear(); me.materials.append(mat)
    prop = bpy.data.objects.new('poe_fuma', me); bpy.context.collection.objects.link(prop)
    bpy.ops.object.select_all(action='DESELECT'); prop.select_set(True); bpy.context.view_layer.objects.active = prop
    bpy.ops.export_scene.gltf(filepath=FUMA_PROP, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False, export_animations=False)
    bpy.data.objects.remove(prop); me.materials.clear()
    return len(me.polygons)
fuma_faces = export_fuma_prop()
# the mount in game axes: the prop's local game axes are X = R_local[:,0], Y (glTF up) = Blender +Z local = fz, Z (glTF) = -Blender Y local = -fy
Mg = np.array([g3(fx), g3(fz), g3(-fy)]).T
q = Matrix([list(r) for r in Mg]).to_quaternion()
chest = np.array(P['chest'])
mount = {'units': 'metres; game axes [x, y, z] = Blender [x, z, -y]', 'prop': '/models/poe-fuma.glb',
         'prop_frame': 'hub centre at the origin; the bone arms in the prop\'s XY plane (Blender); spin axis Blender +Z = the glTF / game +Y of the prop',
         'model_space': {'position': g3(FCt), 'quaternion_xyzw': [round(q.x, 6), round(q.y, 6), round(q.z, 6), round(q.w, 6)]},
         'chest_bone_frame': {'bone': 'chest', 'chest_head_game': g3(chest), 'position': g3(FCt - chest),
                              'quaternion_xyzw': [round(q.x, 6), round(q.y, 6), round(q.z, 6), round(q.w, 6)],
                              'note': 'the game rebuilds bones without rotation, so the chest frame is the model frame translated to the chest head'},
         'hub_axis_game': g3(fz), 'up_in_plane_game': g3(fy), 'right_game': g3(fx), 'tip_radius_m': float(ns['FUMA_R']),
         'across_m': 2 * float(ns['FUMA_R']), 'prop_faces': fuma_faces}
(ROOT / 'export' / 'fuma_mount.json').write_text(json.dumps(mount, indent=2))
fuma.hide_render = True; fuma.hide_viewport = False

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
        c, s_ = math.cos(ang), math.sin(ang); d = V - piv
        Vr = np.stack([d[:, 0], d[:, 1] * c - d[:, 2] * s_, d[:, 1] * s_ + d[:, 2] * c], -1) + piv
        sd = head_sdf(Vr); hidden[f'{o.name}@{ang}'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
sd = head_sdf(np.array([list(v.co) for v in tongue.data.vertices]))
hidden['Poe_tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
print('HIDDEN', json.dumps(hidden), flush=True)
grip = {}
for t, s_ in (('R', -1), ('L', 1)):
    palm = np.array(JB['palm_' + t])
    grip['hand_' + t] = {'hand_head_game': g3(P['hand_' + t]), 'palm_centre_game': g3(palm), 'palm_offset_from_hand_game': g3(palm - np.array(P['hand_' + t]))}
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'poe-toy_rig.blend'))
(ROOT / 'rig-part-labels.json').write_text(json.dumps({o.name: labels[o.name] for o in objects}))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]], 'head_game_m': g3(P[b])} for b in HERO],
       'triangles': total, **{k: ns['LOG'][k] for k in ('head_refine_before', 'head_refine') if k in ns['LOG']}, 'lids': lid_info, 'lids_hidden_check': hidden,
       'palms': grip, 'mouth_seam_points': len(rim), 'fuma_mount': mount,
       'mask_frame': {'centre': [float(v) for v in ns['MASK_C']], 'face': [float(v) for v in ns['MFACE']], 'up': [float(v) for v in ns['MUP']]},
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids are surfaces of revolution about their bone X axis: a rotation slides them along themselves.',
                 'Weights quantized to an exact 255 sum; <= 4 influences. Mask + tassel rigid to head; ears ear -> earTip across the fold.',
                 'fuma_back is not skinned (hidden from render, no Armature modifier): the hero export excludes it; the prop is public/models/poe-fuma.glb.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2))
print('POE_RIG', json.dumps({'bones': len(HERO), 'triangles': total, 'lids': {k: v['pivot_offset_m'] for k, v in lid_info.items()}}), flush=True)
