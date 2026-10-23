"""Mochi (mochi-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, world-axis game contract.

    blender --background --factory-startup --python rig_mochi-toy.py

Runs build_mochi-toy.py in RIG_MODE (part labels, rig atlas charts; the approved GLB, blend and JSON are not touched), then
adds:
  - the armature (exactly the hero contract, identity rest orientations, heads at the joints);
  - eyelids: rigid shells that are surfaces of revolution about their bone's X axis (Rosie's round-8 LID8 upper lid and her
    lower lid), painted from Mochi's own face paint under each lid point (so the calico patch continues across her right lid);
  - the mouth: the skin parted along the painted "w" between sealed corners, a closed cavity and a tongue;
  - weights (spatial fields + part labels, <= 4 influences, quantized to an exact 255 sum): ears spring on ear_* / earTip_*,
    the tail wags on tail1-4, the brush is rigid to the obi (spine), the skirt follows hips with its panels partly on the thighs;
and saves mochi-toy_rig.blend with only Armature modifiers left. The lid / mouth / bind code follows Rosie's rig_rosie-opus.py.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'build_mochi-toy.py').read_text(encoding='utf-8')
ns = {'__file__': str(ROOT / 'build_mochi-toy.py'), '__name__': 'mochi_model', 'RIG_MODE': True}
exec(compile(src, str(ROOT / 'build_mochi-toy.py'), 'exec'), ns)
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MC, MHW = ns['MC'], ns['MHW']
smooth, au, MAT, M2L = ns['smooth'], ns['au'], ns['MAT'], ns['M2L']
head_sdf, front_hit = ns['head_sdf'], ns['front_hit']
NOSE_TIP_L = ns['NOSE_TIP_L']
def sm(a, b, x): return float(smooth(a, b, x))
def smoother(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1); return t * t * t * (t * (6 * t - 15) + 10)
ns['smoother'] = smoother

# ---------------------------------------------------------------- bake world transforms, read part labels
base_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
labels = {}
for o in base_objects:
    names = [g.name.removeprefix('_part_') for g in o.vertex_groups]
    labels[o.name] = [names[max(v.groups, key=lambda g: g.weight).group] if v.groups else '' for v in o.data.vertices]
    mw = o.matrix_world.copy()
    for v in o.data.vertices: v.co = mw @ v.co
    o.matrix_world = Matrix.Identity(4)
    o.vertex_groups.clear()
OBJ = {o.name: o for o in base_objects}

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
mouth_y = float(front_hit(0., CHIN + .15 * W)[0]); corner_z = CHIN + .157 * W
P = {'root': (0, -.010, 0), 'hips': (0, .004, .300), 'spine': (0, .006, .360), 'chest': (0, .010, .430), 'neck': (0, .015, .505),
     'head': (0, .055, .525),                                              # skull base: the nod pivot at the back of the neck
     'jaw': (0, mouth_y + .22 * W, corner_z)}                              # the hinge line inside the head, 0.22 W behind the mouth
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * ns['BROW_X'], float(front_hit(s * ns['BROW_X'], ns['BROW_Z'])[0]) + .012, ns['BROW_Z'])
    P['lip_' + tag] = (s * MHW, float(front_hit(s * MHW, corner_z)[0]) + .002, corner_z)
    E = ns['ear_info'][s]
    P['ear_' + tag] = tuple(float(c) for c in E['S'])
    P['earTip_' + tag] = tuple(float(c) for c in E['S'] + (E['T'] - E['S']) * .5)
    ja = ns['joint_arms'][tag]
    P['upperarm_' + tag] = tuple(ja['shoulder']); P['forearm_' + tag] = tuple(ja['elbow']); P['hand_' + tag] = tuple(ja['wrist'])
    P['thigh_' + tag] = (s * .104, .004, .225); P['shin_' + tag] = (s * .104, .000, .150); P['foot_' + tag] = (s * .104, -.004, .070)   # low hip pivots: a run never swings the leg tops through the skirt
# the tail: tail1 where it leaves the skirt's back top, tail2 at the dip, tail3 on the rise, tail4 at the club's base
TP = np.array([list(p) for p in ns['tpath']]); TS = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(TP, axis=0), axis=1))])
def tail_at(s_): return tuple(float(np.interp(s_, TS, TP[:, k])) for k in range(3))
def nearest_s(p): return float(TS[np.argmin(np.linalg.norm(TP - np.asarray(p), axis=1))])
TAIL_S = [nearest_s(ns['TAIL_CTRL'][1]), nearest_s(ns['TAIL_CTRL'][3]), nearest_s(ns['TAIL_CTRL'][4]), nearest_s(ns['TAIL_CTRL'][5])]
for i, s_ in enumerate(TAIL_S): P['tail%d' % (i + 1)] = tail_at(s_)

# ---------------------------------------------------------------- BVHs of the approved skin and eyes
head = OBJ['Mochi_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Mochi_eye_' + t].data.vertices],
                                    [tuple(p.vertices) for p in OBJ['Mochi_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
def front_y(x, z, tag):
    a = ray_y(eye_tree[tag], x, z); b = ray_y(skin_tree, x, z)
    c = [v for v in (a, b) if v is not None]; return min(c) if c else None

# ---------------------------------------------------------------- eyelids (Rosie's rig: LID8 upper lid, the lower lid)
# ---------------------------------------------------------------- eyelids: rigid shells about the bone X axis
# Each lid is a grid of columns (x slices); every point moves on a circle about its bone's X axis, so the closed /
# squint / rest shapes are one rigid shell. The upper pivot sits on the perpendicular bisector of the eye's own
# vertical chord (bottom rim to top rim), so the shell hugs the eye; its rim-to-rim span is 1.017 rad (closed at 1.22,
# the top ~28 % at 0.488). The edge rows only ever pass over the opening (radius just outside the eye); only the rows
# that sit on the painted lash band when closed step out over it, and those are far up under the brow at 0 and 0.488.
def outline_z(X, top):
    a = np.clip(np.abs(X), 0, 1); return EZ + (1 if top else -1) * EHH * (1 - a ** EN) ** (1 / EN)
def skin_dist(x, pivot, phs):
    """distance from the pivot to the outermost skin crossing along the rays (0, -cos ph, sin ph) in the plane x"""
    phs = np.asarray(phs, float); n = len(phs)
    d = np.stack([np.zeros(n), -np.cos(phs), np.sin(phs)], -1); o = np.array([x, pivot[1], pivot[2]])
    ts = np.linspace(.34, .02, 161)
    Pp = o + ts[None, :, None] * d[:, None, :]
    ins = (head_sdf(Pp.reshape(-1, 3)) < 0).reshape(n, len(ts)); i = np.argmax(ins, 1)
    lo = ts[i]; hi = ts[np.maximum(i - 1, 0)]
    for _ in range(10):
        m = (lo + hi) / 2; inn = head_sdf(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return np.where(ins.any(1), (lo + hi) / 2, .34)
def eye_dist(x, pivot, phs, tag):
    """distance from the pivot axis to the outermost eye surface along the rays (0, -cos ph, sin ph) in the plane x"""
    out = []
    for ph in phs:
        d = Vector((0, -math.cos(ph), math.sin(ph))); o = Vector((x, pivot[1], pivot[2]))
        h = eye_tree[tag].ray_cast(o + d * .90, -d, .90)       # (from 0.9 m: the lower lid's lever pivot sits ~0.36 m back)
        out.append(.90 - h[3] if h[0] is not None else 0.)
    return np.array(out)
ROWS_U = [0, .03, .06, .09, .12, .155, .20, .26, .33, .42, .53, .66, .82, 1.0]
ROWS_D = [0, .04, .10, .18, .30, .46, .66, 1.0]
lid_info = {}; lid_objects = []; LID_PAINT = {}
def eye_sd(p, tag):
    loc, nrm, idx, dist = eye_tree[tag].find_nearest(Vector(p), .3)
    if loc is None: return .3
    return dist if (Vector(p) - loc).dot(nrm) >= 0 else -dist
RIM_N = {}
for tag_, s_ in (('L', 1), ('R', -1)):
    ps_ = np.linspace(0, 2 * math.pi, 72, endpoint=False); rx_, rz_ = ns['eye_xz'](s_, ps_, 1.02)
    ry_ = front_hit(rx_, rz_); RIM_N[tag_] = (np.stack([rx_, rz_], -1), ns['grad_n'](np.stack([rx_, ry_, rz_], -1)))
def lid_normal(p, tag):
    """shading normal of a lid point (at its target pose): over the opening, a smooth membrane interpolated from the skin's
    own normals around the rim (Shepard, 1/d^3), so the lid meets the skin with the same normal all round (no ring, no
    step in the toon band); outside the opening it hands over to the skin normal underneath"""
    s_ = 1 if tag == 'L' else -1; xz, N = RIM_N[tag]
    d2 = (xz[:, 0] - p[0]) ** 2 + (xz[:, 1] - p[2]) ** 2; w = 1 / (d2 + 1e-7) ** 1.5
    n = (w[:, None] * N).sum(0); n /= np.linalg.norm(n)
    sr = float(ns['eye_s'](s_, p[0], p[2])[0])
    if sr > 1.0:
        hy = float(front_hit(np.array([p[0]]), np.array([p[2]]))[0])
        if np.isfinite(hy):
            t = float(smooth(1.0, 1.12, sr)); nk = ns['grad_n'](np.array([[p[0], hy, p[2]]]))[0]
            n = (1 - t) * n + t * nk; n /= np.linalg.norm(n)
    return n
def lid_normal_v(P, tag):
    """lid_normal for many points (round 8)"""
    s_ = 1 if tag == 'L' else -1; xz, N = RIM_N[tag]; P = np.asarray(P, float)
    d2 = (xz[None, :, 0] - P[:, None, 0]) ** 2 + (xz[None, :, 1] - P[:, None, 2]) ** 2; w = 1 / (d2 + 1e-7) ** 1.5
    n = w @ N; n /= np.linalg.norm(n, axis=1, keepdims=True)
    sr = ns['eye_s'](s_, P[:, 0], P[:, 2])[0]
    hy = front_hit(P[:, 0], P[:, 2]); ok = (sr > 1.0) & np.isfinite(hy)
    if ok.any():
        nk = ns['grad_n'](np.stack([P[ok, 0], hy[ok], P[ok, 2]], -1)); t = smooth(1.0, 1.12, sr[ok])[:, None]
        m = (1 - t) * n[ok] + t * nk; n[ok] = m / np.linalg.norm(m, axis=1, keepdims=True)
    return n
def lid_geometry(tag, upper, dz):
    s = 1 if tag == 'L' else -1
    cx = s * EX; ye = float(front_hit(cx, EZ)[0]); H = 2 * EHH
    if upper:
        # the pivot sits on the bisector of the eye's own vertical chord (centre column), at k x the eye profile's
        # radius of curvature (dz carries k - 1): k = 1 is the circumcentre of bottom rim, middle and top rim
        zb_, zt_ = EZ - .97 * EHH, EZ + .97 * EHH
        B = np.array([ray_y(eye_tree[tag], cx, zb_), zb_]); T = np.array([ray_y(eye_tree[tag], cx, zt_), zt_])
        M_ = np.array([ray_y(eye_tree[tag], cx, EZ), EZ])
        ch = T - B; Lc = float(np.linalg.norm(ch)); u = ch / Lc; nb = np.array([u[1], -u[0]])
        if nb[0] < 0: nb = -nb                                   # into the head (+y)
        sag = float((M_ - (B + T) / 2) @ -nb)                    # how far the eye bulges in front of its chord
        rho = (Lc * Lc / 4 + sag * sag) / (2 * sag); R = rho * (1 + dz)
        m = (B + T) / 2 + nb * math.sqrt(R * R - Lc * Lc / 4)
        yp, zp = float(m[0]), float(m[1])
    else:
        # the arch top travels 0.31 H between -0.10 (just under the lower rim) and -0.24 (happy): horizontal lever;
        # the pivot sits dz above the arch, so lowering the lid also slides it back into the head
        a_lev = .37 * H / .14; zp = (EZ - .40 * EHH) + dz; yp = ye + a_lev
    pivot = np.array([cx, yp, zp])
    Xs = np.linspace(-1.14, 1.0, 21) if upper else np.linspace(-.88, LOWER_X_OUT, 19)   # Mochi: the lower lid stops short of the outer corner
    cols = []
    for X in Xs:
        x = cx + s * EHW * X
        zz = np.linspace(EZ - EHH * 1.06, EZ + EHH * (1.30 if upper else .55), 44)
        d_open = 0; d_band = 0
        for z in zz:
            y = front_y(x, z, tag)
            if y is None: continue
            inside_open = outline_z(X, False) <= z <= outline_z(X, True)
            Zn = (z - EZ) / EHH; srn = (abs(X) ** EN + abs(Zn) ** EN) ** (1 / EN)
            band = upper and Zn > -.05 and .96 <= srn <= 1.05 + float(ns['lash_th'](np.array([math.atan2(Zn, X)]))[0])
            low_open = (not upper) and outline_z(X, False) <= z <= (EZ - EHH) + .70 * EHH
            dd = math.hypot(yp - y, z - zp)
            if (inside_open if upper else low_open): d_open = max(d_open, dd)
            if band: d_band = max(d_band, dd)
        cols.append([X, x, d_open, d_band])
    for k in range(len(cols)):                                  # the corner columns (no opening) take a neighbour's
        if cols[k][2] == 0:
            cols[k][2] = cols[min((abs(k - j), j) for j in range(len(cols)) if cols[j][2] > 0)[1]][2]
    gap = .0022 if upper else .0018
    if upper:   # the corner columns tuck just under the skin at the eye corners, so the lid's ends never stand out
        for k in (0, len(cols) - 1):
            x = cols[k][1]; yf = front_y(x, EZ, tag) or ye
            sk = float(skin_dist(x, pivot, [math.atan2(EZ - zp, yp - yf)])[0])
            # inner end: just on the skin beyond the corner, so it covers the thin inner end of the painted lash band
            cols[k][2] = (sk - gap + .0004) if k == 0 else min(cols[k][2], sk - gap - .002); cols[k][3] = 0
    def ang(z, r): return math.atan2(z - zp, math.sqrt(max(r * r - (z - zp) ** 2, 1e-9)))
    if upper:
        # the squint edge (0.488) is one level line covering the top 27 %, lowered only if a column could not close
        def closes(zl):
            for X, x, d_o, d_b in cols:
                r = d_o + gap
                if abs(X) <= .95 and zp + r * math.sin(ang(zl, r) - (1.22 - .488)) > outline_z(X, False) - .0015: return False
            return True
        coverage = .27
        while coverage < .315 and not closes(EZ + EHH - coverage * 2 * EHH): coverage += .005
        z_level = EZ + EHH - coverage * 2 * EHH
    rows = ROWS_U if upper else ROWS_D
    target = 1.22 if upper else -.24
    if upper:
        OV_T = .0020
        U = []                              # the highest squint edge each outer column can take and still close (ov = OV_T)
        for X, x, d_o, d_b in cols:
            r0 = d_o + gap
            u = zp + r0 * math.sin(ang(outline_z(X, False) - OV_T, r0) + (1.22 - .488)) if X > 0 else z_level
            U.append(max(u, z_level))
        ZS = [z_level if X <= 0 else max(z_level, min(U[j] for j in range(i, len(cols)) if cols[j][0] > 0))
              for i, (X, *_r) in enumerate(cols)]           # level inside, non-decreasing outward (never sloping down)
        PE = [ang(zs_, d_o + gap) - (1.22 - .488) for zs_, (X, x, d_o, d_b) in zip(ZS, cols)]
    V = []; UVs = []; NRM = []; G = []; ARC = []; RAD = []; out_cols = []; DARK = []; OV = []
    for i, (X, x, d_o, d_b) in enumerate(cols):
        r0 = d_o + gap
        if upper:
            pe = PE[i]
            pt = ang(outline_z(X, True) + EHH * .34, r0) + .45
            phT = ang(outline_z(X, True), r0)
        else:
            arch = (EZ - EHH) + EHH * (.70 - .30 * min(abs(X) / .88, 1.) ** 2)     # 35 % at the centre, 20 % at the corners
            pe = ang(arch, r0); pt = min(pe - .03, ang(min(arch, outline_z(X, False)) - .20 * EHH, r0))
        phs = [pe + (pt - pe) * t for t in rows]
        if upper:          # over the band (closed) the shell follows the skin just outside it, then sinks into it
            sk = skin_dist(x, pivot, phs)
            Zb = max(float(outline_z(X, True) - EZ) / EHH, .05)          # the band's top in this column: sr = 1 + th(psi)
            for _ in range(6):
                srt = 1.04 + float(ns['lash_th'](np.array([math.atan2(Zb, abs(X))]))[0])
                Zb = max(srt ** EN - min(abs(X), srt * .999) ** EN, 1e-6) ** (1 / EN)
            phB = ang(EZ + EHH * Zb, r0)
            rr = [r0 if ph < phT - .06 else max(r0, skin + gap - (gap + .0025) * float(smooth(phB - .04, phB + .06, ph))) for ph, skin in zip(phs, sk)]
            sq = 1.22 - .488
            sk_sq = skin_dist(x, pivot, [ph + sq for ph in phs]); ed = eye_dist(x, pivot, phs, tag)
            rr = [min(r, max(sk_ - .0025, e_ + .0008)) if (ph + sq > phT - .04 and ph < phT - .06) else r
                  for r, ph, sk_, e_ in zip(rr, phs, sk_sq, ed)]
        else:              # below the lower rim the lid dives into the cheek (a clean, steep crossing, no ragged seam)
            phR = ang(outline_z(X, False), r0)
            rr = [r0 - .0035 * float(smooth(phR + .01, phR - .06, ph)) for ph in phs]
            ed = eye_dist(x, pivot, phs, tag)               # Mochi: rows over the eyeball hug it at -0.24 (no standoff at its outer edge)
            rr = [min(r_, e_ + .0012) if e_ > 0 else r_ for r_, e_ in zip(rr, ed)]
        out_cols.append((x, r0, pe, pt))
        if upper:
            ov = max(0., (ang(outline_z(X, False), r0) - pe) * r0); OV.append(ov)
            DARK.append(.0020 + .0058 * max(0., 1 - min(abs(X), 1.) ** 2) ** .6)       # 7.8 mm at the centre, tapering to 2 mm
        g_row = []; a_row = []
        for j, (t, ph, r) in enumerate(zip(rows, phs, rr)):
            ph_rest = ph + target                                    # posed at the target, stored at the bone rest
            V.append((x, yp - r * math.cos(ph_rest), zp + r * math.sin(ph_rest)))
            UVs.append((i / (len(cols) - 1), t))
            pz_t = zp + r * math.sin(ph); py_t = yp - r * math.cos(ph)
            g_row.append((x, py_t, pz_t)); a_row.append(abs(ph - pe) * r0)
            # shading normal: the face's own surface normal under this point at the target pose, carried back to rest
            nrm = lid_normal(np.array([x, py_t, pz_t]), tag)
            c, s_ = math.cos(-target), math.sin(-target)
            NRM.append((nrm[0], nrm[1] * c - nrm[2] * s_, nrm[1] * s_ + nrm[2] * c))
        G.append(g_row); ARC.append(a_row); RAD.append(rr)
    nr = len(rows); fs = []
    for i in range(len(cols) - 1):
        for j in range(nr - 1):
            q = i * nr + j; fs.append((q, q + nr, q + nr + 1, q + 1))
    closure = None; standoff = 0
    if upper:   # closed (1.22): the edge must reach below the lower rim; standoff: how far the shell floats off the eye
        closure = max(zp + r0 * math.sin(pe) - (outline_z(X, False) - .0015) for (X, x, d_o, d_b), (x_, r0, pe, pt) in zip(cols, out_cols) if abs(X) <= .95)
        x_c, r_c, pe_c, pt_c = out_cols[len(cols) // 2]
        phs_c = np.linspace(pe_c, ang(outline_z(0, True), r_c), 12); dev = []
        for ph in phs_c:
            h_ = eye_tree[tag].ray_cast(Vector((x_c, yp, zp)) + Vector((0, -math.cos(ph), math.sin(ph))) * .34, Vector((0, math.cos(ph), -math.sin(ph))), .34)
            if h_[0] is not None: dev.append(r_c - (.34 - h_[3]))
        standoff = max(dev) if dev else 0
        closure = (closure, coverage, standoff)
    paint = {'G': np.array(G), 'arc': np.array(ARC), 'X': np.array([c[0] for c in cols]), 'rows': np.array(rows), 'dark': np.array(DARK)}
    return V, UVs, fs, pivot, out_cols, target, NRM, closure, paint
def rest_exposure(V, pivot, angs):
    V = np.array(V); worst = -9.
    for a in angs:
        c, s_ = math.cos(a), math.sin(a); d = V - pivot
        Vr = np.stack([d[:, 0], d[:, 1] * c - d[:, 2] * s_, d[:, 1] * s_ + d[:, 2] * c], -1) + pivot
        worst = max(worst, float(head_sdf(Vr).max()))
    return worst
# ---------------------------------------------------------------- round 8: the upper lid for the convex face (LID8, default on)
# The old shell came out of the skin at the top rim, under the painted lash band, which stays put: mid-blink the eye read as an
# empty skin oval inside a dark outline, its edge tore where the shell grazed the skin, and shut its edge sank ~3 cm under
# the cheek (no lash curve). Now each column is one radius r_body = the skin's distance from the hinge at the TOP of the
# lash band (+0.3 mm), so the skin-coloured lid always emerges along the band top (the skin's distance grows above it) and
# covers the band from the first frame: one lash line travels down. Only its dark lash stripe (the edge, painted on the
# lid) dives to r_edge, just outside the eye, to tuck under the lower rim when shut; dark on the dark band, that dive can't
# show. The hinge sits on the eye's height, far enough back (0.21 m) that the lid stands ~2-5 mm off the eye.
LID8 = os.environ.get('LID8', '1') == '1'
L8 = dict(YB=float(os.environ.get('L8_YB', '.13')), ZO=float(os.environ.get('L8_ZO', '-.004')),     # Mochi: the hinge 0.13 m back (0.488 = ~25 % squint)
          SQ=float(os.environ.get('L8_SQ', '.488')), COV=float(os.environ.get('L8_COV', '.27')),
          DELTA=.0003, G_BODY=.0008, G_EDGE=.0006, TUCK=.0005, NCOL=21)
# MOCHI_LEVEL=1: the level-squint variant (rig review 1). A rigid lid about world X can't be level at 0.488 AND follow the
# lower rim at 1.22 on Mochi's wrapping eye (its inner half sits 1.58x further from the hinge than its outer half): levelling
# needs 12-44 mm of hidden tuck, which either darkens the squinting lid or breaks the shut lash curve. Off by default.
LOWER_X_OUT = float(os.environ.get('LOWER_X_OUT', '.88'))
LEVEL = os.environ.get('MOCHI_LEVEL', '0') == '1'; LEV_ROUND, LEV_OFF = .40, 0.
SHUT_TUCK = float(os.environ.get('MOCHI_SHUT_TUCK', '.0025'))
SLOPE_W = float(os.environ.get('MOCHI_SLOPE', '0'))      # rig review 3: the happy edge's inner end this far (W) below its outer end
OUTER_X = [1.0, 1.06, 1.12, 1.18, 1.24, 1.30, 1.38, 1.46, 1.56]      # the last one is the tucked end column (review 3: out past the painted wing's tip)
OUTER_DIAG = []
ROWS8 = [0, .025, .05, .075, .10, .125, .15] + [float(v) for v in np.linspace(.15, 1, 13)[1:]]
def eye_hits(x, pivot, phs, tag):
    """outermost VISIBLE eye surface (front projection inside the opening) along the hinge rays; nan elsewhere"""
    s_ = 1 if tag == 'L' else -1; out = np.full(len(phs), np.nan)
    for i, ph in enumerate(phs):
        d = Vector((0, -math.cos(ph), math.sin(ph))); o = Vector((x, pivot[1], pivot[2]))
        h = eye_tree[tag].ray_cast(o + d * .40, -d, .40)
        if h[0] is not None and float(ns['eye_s'](s_, h[0].x, h[0].z)[0]) < 1.0: out[i] = .40 - h[3]
    return out
def upper_lid8(tag):
    s = 1 if tag == 'L' else -1; cx = s * EX; ye = float(front_hit(cx, EZ)[0])
    yp, zp = ye + L8['YB'], EZ + L8['ZO']; pivot = np.array([cx, yp, zp]); target = 1.22
    def angp(y, z): return math.atan2(z - zp, yp - y)
    Xs = np.unique(np.r_[np.linspace(-1.14, 1.0, L8['NCOL']), [-.97, -1.24], OUTER_X, [.945, .975]]); cols = []; diag = []     # (review 3: .945/.975 close the seam to the cover pieces)     # (-0.97: the rim turns up steeply into the inner corner)
    zlev = EZ + EHH - L8['COV'] * 2 * EHH
    for X in Xs:
        x = cx + s * EHW * X
        zl, zt = (float(outline_z(X, False)), float(outline_z(X, True))) if abs(X) < 1 else (EZ, EZ)
        Zb = max(float(zt - EZ) / EHH, .05)
        for _ in range(6):
            srt = 1.04 + float(ns['lash_th'](np.array([math.atan2(Zb, abs(X))]))[0])
            Zb = max(srt ** EN - min(abs(X), srt * .999) ** EN, 1e-6) ** (1 / EN)
        zb = EZ + EHH * Zb
        fy = lambda z: float(front_hit(np.array([x]), np.array([z]))[0])
        pl, pt_, pb = angp(fy(zl), zl), angp(fy(zt), zt), angp(fy(zb), zb)
        phs = np.arange(pl - .40, pb + 1.75, .004); dsk = skin_dist(x, pivot, phs)
        po = np.arange(pl - .02, pt_ + .02, .006); de = eye_hits(x, pivot, po, tag)
        maxeye = float(np.nanmax(de)) if np.isfinite(de).any() else 0.
        d_bt = float(np.interp(pb, phs, dsk))
        r_body = max(d_bt + L8['DELTA'], maxeye + L8['G_BODY'])
        # the crossing: where the skin passes behind... the first angle above the top rim with the skin beyond r_body
        above = (phs > pt_) & (dsk > r_body)
        px = float(phs[np.argmax(above)]) if above.any() else pb
        r_edge = min(r_body, max(maxeye + L8['G_EDGE'], float(np.interp(pl, phs, dsk)) - L8['TUCK'])) if np.isfinite(de).any() else r_body
        pe = pl - .004                       # shut, every column's edge sits just under the lower rim: one clean lash curve
        dk = .0020 + .0058 * max(0., 1 - min(abs(X), 1.) ** 2) ** .6
        if X < 0: dk = max(.0007, dk * float(smooth(-.98, -.55, X)))      # fades toward the inner corner (no hook)
        tuck = 0.; outer = False
        if abs(X) < .999 and SHUT_TUCK > 0:    # rig review 3: shut, the edge sinks SHUT_TUCK under the lower rim (no green from the raised game camera); its lash line stays on the rim
            pe -= SHUT_TUCK / r_edge; tuck = SHUT_TUCK
        if OUTER_X[0] - .001 <= X < OUTER_X[-1] - .001:
            # past the outer corner: shut, these columns cover the painted outer lash and wing (no stripe; the lid paints its own wing)
            z_lo = EZ + EHH * float(np.interp(X, [1.0, 1.12, 1.22, 1.34, 1.50], [-.80, -.80, -.62, -.42, -.20]))     # (review 3: low enough to carry the shut wing)
            z_hi = EZ + EHH * (1.08 + .12 * float(smooth(1.30, 1.46, X)))
            pe = angp(fy(z_lo), z_lo); ph_hi = angp(fy(z_hi), z_hi); dk = 0.
            zone = (phs >= pe) & (phs <= max(ph_hi, pb)); r_cov = float(np.max(dsk[zone])) + .0006
            rest = (phs >= pe + target) & (phs <= max(ph_hi, pb) + .03 + target)      # the same rows at rest, rotated up by 1.22
            r_hide = float(np.min(dsk[rest])) - .0010 if rest.any() else r_cov
            r_body = r_edge = min(r_cov, r_hide); outer = True
            OUTER_DIAG.append((round(X, 2), round(r_cov, 4), round(r_hide, 4)))
            above = (phs > ph_hi) & (dsk > r_body); px = float(phs[np.argmax(above)]) if above.any() else ph_hi
        if X <= -.999:                       # past the inner corner: the edge well under the corner, no stripe (the interpolated edge stays under the rim)
            pe = angp(fy(EZ - .30 * EHH), EZ - .30 * EHH); dk = 0.
            if X > -1.2:                     # ... and in front of the band's inner end (it reaches X -1.11) (the skin bulges out toward the bridge)
                zone = (phs >= pe) & (phs <= pb); r_body = r_edge = max(r_body, float(np.max(dsk[zone])) + .0005)
        if X < -1.2 or X >= OUTER_X[-1] - .001:   # the lid's two ends tuck just under the skin all through the sweep (X -1.03 / -1.14 cover the band's inner end)
            sw = (phs >= pe - .02) & (phs <= pb + .45)
            r_body = r_edge = float(np.min(dsk[sw])) - .0008; dk = 0.; px = pb
        cols.append(dict(X=X, x=x, pl=pl, pt=pt_, pb=pb, px=px, r_body=r_body, r_edge=r_edge, pe=pe, dk=dk, dkp=dk, tuck=tuck, outer=outer, zt=zt, phs=phs, dsk=dsk, maxeye=maxeye))
        diag.append((round(X, 2), round(r_body, 4), round((r_body - r_edge) * 1000, 1), round((px - pb) * r_body * 1000, 1),
                     round((pe - pl) * r_body * 1000, 1), round((r_body - maxeye) * 1000, 1)))
    if LEVEL:
        # rig review 1: at the happy squint the visible edge is ONE level line over the middle 70 % (at the lowest natural edge
        # there, so the tucks stay small), rounding softly up into the corners; a column whose edge must come down for it tucks
        # that much under the cheek when shut (hidden), and its painted lash stripe widens by the tuck
        dq = target - L8['SQ']
        zn = {c['X']: zp + c['r_edge'] * math.sin(c['pe'] + dq) for c in cols if abs(c['X']) < .999}
        z0 = min(v for X_, v in zn.items() if abs(X_) <= .70) + LEV_OFF * EHH
        for c in cols:
            X = c['X']
            if abs(X) >= .999 or c['outer']: continue
            z_lev = z0 + EHH * LEV_ROUND * float(smooth(.70, 1.08, abs(X)))
            if not (z_lev < zn[X] < c['zt'] + .35 * EHH): continue
            pe_lev = math.asin(max(-1., min(1., (z_lev - zp) / c['r_edge']))) - dq
            lowest = c['pe']
            for ph_ in c['phs'][c['phs'] <= c['pe']][::-1]:
                if float(np.interp(ph_, c['phs'], c['dsk'])) > c['r_edge'] + .0010: lowest = float(ph_)
                else: break
            pe_new = max(pe_lev, lowest)
            if pe_new < c['pe']:
                c['tuck'] = (c['pe'] - pe_new) * c['r_edge']; c['pe'] = pe_new; c['dkp'] = c['dk'] + c['tuck']
    if SLOPE_W > 0:
        # rig review 3: at the happy squint the edge's inner end sits SLOPE_W (head widths) below its outer end (front view),
        # the line rising evenly toward the outer corner; a column whose natural edge is above that line comes down to it and
        # tucks that much under the lower rim when shut (hidden; its painted lash line stays on the rim)
        dq = target - L8['SQ']
        zn = {c['X']: zp + c['r_edge'] * math.sin(c['pe'] + dq) for c in cols if abs(c['X']) < .999 and not c['outer']}
        Xo = max(X_ for X_ in zn if X_ <= .90); z_o = zn[Xo]
        for c in cols:
            X = c['X']
            if X not in zn or X >= Xo: continue
            z_cap = z_o - SLOPE_W * W * (Xo - X) / (Xo + .90)
            if zn[X] <= z_cap: continue
            pe_cap = math.asin(max(-1., min(1., (z_cap - zp) / c['r_edge']))) - dq
            lowest = c['pe']
            for ph_ in c['phs'][c['phs'] <= c['pe']][::-1]:
                if float(np.interp(ph_, c['phs'], c['dsk'])) > c['r_edge'] + .0010: lowest = float(ph_)
                else: break
            pe_new = max(pe_cap, lowest)
            if pe_new < c['pe']:
                c['tuck'] = (c['pe'] - pe_new) * c['r_edge']; c['pe'] = pe_new
        print('SLOPE', tag, SLOPE_W, 'tuck_mm', [(round(c['X'], 2), round(c['tuck'] * 1000, 1)) for c in cols if c['tuck'] > 0], flush=True)
    V = []; UVs = []; NRM = []; G = []; ARC = []; out_cols = []
    nr = len(ROWS8)
    for i, c in enumerate(cols):
        dk = c['dk']; ramp = max(min(.85 * dk, dk - .0007), 1e-4)
        ph_dark = c['pe'] + max(1.05 * (c['dk'] + c['tuck']), .004) / c['r_edge']; ph_top = max(c['px'], c['pb']) + .03
        g_row = []; a_row = []
        for t in ROWS8:
            ph = c['pe'] + (ph_dark - c['pe']) * t / .15 if t <= .15 else ph_dark + (ph_top - ph_dark) * (t - .15) / .85
            arc = (ph - c['pe']) * c['r_edge']; a2 = arc - c['tuck']
            k = 0. if a2 <= 0 else (float(ns['smoother'](0, ramp, a2)) if a2 < ramp else 1.)
            r = c['r_edge'] + (c['r_body'] - c['r_edge']) * k
            if c['outer']:      # in front of the skin when shut (covers the painted lash), inside it at rest
                r = min(float(np.interp(ph, c['phs'], c['dsk'])) + .0006, float(np.interp(ph + target, c['phs'], c['dsk'])) - .0010)
            ph_rest = ph + target
            V.append((c['x'], yp - r * math.cos(ph_rest), zp + r * math.sin(ph_rest))); UVs.append((i / (len(cols) - 1), t))
            py_t = yp - r * math.cos(ph); pz_t = zp + r * math.sin(ph)
            g_row.append((c['x'], py_t, pz_t)); a_row.append(arc); NRM.append((c['x'], r, ph))
        G.append(g_row); ARC.append(a_row); out_cols.append((c['x'], c['r_body'], c['pe'], ph_top))
    # shading normals: the skin ball's normal under each vertex (over the opening too: the shut lid is that skin), averaged in the lid's
    # own frame over every blink angle at which that vertex shows (shut weighted 3x), so the half-closed lid meets the skin
    # around it without a lighter or darker patch (one rigid normal can't be exact at every angle; this halves the worst error)
    XR = np.array(NRM); acc = np.zeros((len(XR), 3)); wsum = np.zeros(len(XR))
    for a in np.linspace(0, target, 13):
        pa = XR[:, 2] + (target - a)
        Pp = np.stack([XR[:, 0], yp - XR[:, 1] * np.cos(pa), zp + XR[:, 1] * np.sin(pa)], -1)
        vis = head_sdf(Pp) > -.0006
        Q = Pp.copy()                         # the convex ball's own normal under the lid (round 8: no socket, so no membrane)
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * ns['grad_n'](Q)
        n = ns['grad_n'](Q); c_, s_ = math.cos(-a), math.sin(-a)
        nb = np.stack([n[:, 0], n[:, 1] * c_ - n[:, 2] * s_, n[:, 1] * s_ + n[:, 2] * c_], -1)
        w = np.where(vis, 8. if a == target else 1., 0.)     # Mochi: the shut normal dominates (no outline round the shut lid)
        if a == target: w = np.maximum(w, 1e-3)          # never empty: the shut normal as a fallback
        acc += w[:, None] * nb; wsum += w
    NRM = [tuple(v) for v in acc / np.linalg.norm(acc, axis=1, keepdims=True)]
    fs = []
    for i in range(len(cols) - 1):
        for j in range(nr - 1):
            q = i * nr + j; fs.append((q, q + nr, q + nr + 1, q + 1))
    # closure (edge vs the lower rim, shut), the squint cover at L8.SQ, the shut standoff off the eye at the centre column
    clo = max(zp + c['r_edge'] * math.sin(c['pe']) - (outline_z(c['X'], False) - .0015) for c in cols if abs(c['X']) <= .95)
    covs = []
    for c in cols:
        if abs(c['X']) > .9: continue
        ze = zp + c['r_edge'] * math.sin(c['pe'] + target - L8['SQ']); zl, zt = outline_z(c['X'], False), outline_z(c['X'], True)
        covs.append(float(np.clip((zt - ze) / (zt - zl), 0, 1)))
    cc_ = cols[len(cols) // 2]; standoff = cc_['r_body'] - cc_['maxeye']
    closure = (clo, float(np.mean(covs)), standoff)
    print('LID8', tag, 'pivot', pivot.round(4), 'cols (X, r_body, dive_mm, cross_above_bandtop_mm, edge_below_rim_mm, standoff_mm)', diag,
          'squint_cover', [round(v, 2) for v in covs], 'tuck_mm', [round(c['tuck'] * 1000, 1) for c in cols], 'outer(X, r_cover, r_hide)', OUTER_DIAG[-6:], flush=True)
    paint = {'G': np.array(G), 'arc': np.array(ARC), 'X': np.array([c['X'] for c in cols]), 'rows': np.array(ROWS8),
             'dark': np.array([c['dk'] for c in cols]), 'tuck': np.array([c['tuck'] for c in cols])}
    return V, UVs, fs, pivot, out_cols, target, NRM, closure, paint

LOW_CAP_ANGS = (-.18, -.24, -.27)                     # the game's happy -0.24 (and a little past it); -0.30 pulled 28 mm and tore the edge
LOW_HUG = float(os.environ.get('LOW_HUG', '.0025'))     # rig review 3: 2.5 mm off the eye (1.2 mm let the coarse eye mesh cut through: torn pale edges)
def lower_lid_explicit(tag, dz):
    """Mochi's lower lid (rig review 2), built at its happy pose (-0.24) in the eye's frame: an upward-arched edge (35 % of the
    opening at the centre, under the rim by the corners) on a surface that hugs the eyeball 1.2 mm in front of it and dives just
    under the cheek below the rim; its rest pose is that shape turned back about the lever hinge (dz above the arch), so the shell
    is rigid and at the game's neutral -0.10 it sits under the cheek."""
    s = 1 if tag == 'L' else -1; cx = s * EX; ye = float(front_hit(cx, EZ)[0]); H = 2 * EHH
    a_lev = .37 * H / .14; zp = (EZ - .40 * EHH) + dz; yp = ye + a_lev; pivot = np.array([cx, yp, zp]); target = -.24
    def rx(P_, phi):
        d_ = np.asarray(P_, float) - pivot; c_, s_ = math.cos(phi), math.sin(phi)
        return np.stack([d_[..., 0], d_[..., 1] * c_ - d_[..., 2] * s_, d_[..., 1] * s_ + d_[..., 2] * c_], -1) + pivot
    Xs = np.linspace(-.94, .94, 23); NRW = 13
    G = []; ARC = []; NT = []; cols = []
    for X in Xs:
        x = cx + s * EHW * X; zl = float(outline_z(X, False))
        arch = (EZ - EHH) + EHH * (.70 - .30 * min(abs(X) / .94, 1.) ** 2)     # 35 % at the centre, 20 % toward the corners
        z_bot = min(zl, arch) - .50 * EHH
        g_row = []; a_row = []; n_row = []; prev = None; acc = 0.
        for t in np.linspace(0, 1, NRW) ** 1.15:
            z = arch + (z_bot - arch) * t
            yf = front_y(x, z, tag); yf = float(front_hit(np.array([x]), np.array([z]))[0]) if yf is None else yf
            w_in = float(smooth(zl + .002, zl - .004, z))                       # 0 over the opening, 1 below the rim
            y = yf - LOW_HUG * (1 - w_in) + .0060 * w_in                        # 6 mm under the cheek: the skin's flat triangles can't cut it
            q = np.array([x, y, z]); acc += 0. if prev is None else float(np.linalg.norm(q - prev)); prev = q
            g_row.append(q); a_row.append(acc)
        G.append(g_row); ARC.append(a_row)
        cols.append((x, float(np.linalg.norm(np.array(g_row[0]) - pivot)), 0., 0.))
    G = np.array(G); ARC = np.array(ARC)
    NT = lid_normal_v(G.reshape(-1, 3), tag)
    Vr = rx(G.reshape(-1, 3), -target)                       # rest = the happy shape turned back by +0.24
    c_, s_ = math.cos(-target), math.sin(-target)
    Nr = np.stack([NT[:, 0], NT[:, 1] * c_ - NT[:, 2] * s_, NT[:, 1] * s_ + NT[:, 2] * c_], -1)
    V = [tuple(v) for v in Vr]; NRM = [tuple(n) for n in Nr]
    rows = np.linspace(0, 1, NRW); UVs = []
    for i in range(len(Xs)):
        for j in range(NRW): UVs.append((i / (len(Xs) - 1), float(rows[j])))
    fs = []
    for i in range(len(Xs) - 1):
        for j in range(NRW - 1):
            q = i * NRW + j; fs.append((q, q + NRW, q + NRW + 1, q + 1))
    paint = {'G': G, 'arc': ARC, 'X': Xs, 'rows': rows}
    return V, UVs, fs, pivot, cols, target, NRM, None, paint
def lid_shell(tag, upper):
    angs = [0.0] if upper else [0.0, -.10]
    cands = np.linspace(-.04, .32, 10) if upper else np.linspace(0, .32, 17)
    best = None
    if upper and LID8:
        g = upper_lid8(tag); e = rest_exposure(g[0], g[3], angs); best = (e, 0., g); cands = []
    for dz in cands:
        g = lid_geometry(tag, upper, float(dz)) if upper else lower_lid_explicit(tag, float(dz)); e = rest_exposure(g[0], g[3], angs)
        if upper:      # hidden at rest and closing fully are required; then the squint nearest 28 % and the snuggest shell
            e = (0 if e < -.0005 else 1 + e * 100) + (0 if g[7][0] <= 0 else 1 + g[7][0] * 100) + abs(g[7][1] - .28) + 4 * g[7][2]
        if best is None or e < best[0]: best = (e, float(dz), g)
    e, dz, (V, UVs, fs, pivot, cols, target, NRM, closure, paint) = best
    if os.environ.get('LID_DIAG'):
        nr_ = len(ROWS_U if upper else ROWS_D)
        for a in angs + ([.488, 1.22] if upper else [-.24]):
            c_, s__ = math.cos(a), math.sin(a); d_ = np.array(V) - pivot
            Vr_ = np.stack([d_[:, 0], d_[:, 1] * c_ - d_[:, 2] * s__, d_[:, 1] * s__ + d_[:, 2] * c_], -1) + pivot
            sd_ = head_sdf(Vr_)
            sr_ = ns['eye_s'](1 if tag == 'L' else -1, Vr_[:, 0], Vr_[:, 2])[0]
            flap = (sd_ > .0005) & (sr_ > 1.03)
            print('LID_DIAG', tag, upper, a, [(int(k // nr_), int(k % nr_), round(float(sd_[k]) * 1000, 2)) for k in np.argsort(-sd_)[:6]],
                  'flaps', int(flap.sum()), [(int(k // nr_), int(k % nr_), round(float(sd_[k]) * 1000, 1), round(float(sr_[k]), 2)) for k in np.where(flap)[0][:6]], flush=True)
        print('LID_DIAG', tag, upper, 'pivot', pivot.round(4), 'dz', dz, 'closure', closure, 'radii', [round(c[1], 4) for c in cols], flush=True)
        if upper: print('LID_DIAG dark_mm', [round(d_ * 1000, 1) for d_ in paint['dark']], flush=True)
    chart = ('lidU' if upper else 'lidD') + '.' + tag
    paint['tag'] = tag; paint['pivot_local'] = np.array(pivot); paint['target'] = target
    LID_PAINT[chart] = paint                                  # per side: the calico patch differs left / right (G in the eye's frame)
    name = ('Mochi_lidU_' if upper else 'Mochi_lidD_') + tag
    Rw_ = EYE_FRAME[tag]['Rw']; pivot_l = np.array(pivot)
    V = to_world(np.array(V), tag).tolist(); NRM = (np.array(NRM) @ Rw_.T).tolist(); pivot = to_world(pivot_l, tag)
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], fs); me.update()
    layer = me.uv_layers.new(name='Atlas')
    for p in me.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer.data[l].uv = au(chart, *UVs[me.loops[l].vertex_index])
    bm = bmesh.new(); bm.from_mesh(me); hk = hinge(tag)
    for f in bm.faces:        # outward = away from the (tilted) hinge axis
        c = np.array(f.calc_center_median()) - pivot; rv = c - hk * (c @ hk)
        if np.dot(np.array(f.normal), rv) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
    me.normals_split_custom_set([tuple(NRM[me.loops[l].vertex_index]) for l in range(len(me.loops))])
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT)
    lid_objects.append((ob, ('lidU_' if upper else 'lidD_') + tag))
    lid_info[name] = {'pivot': [float(v) for v in pivot], 'pivot_eye_frame': [float(v) for v in pivot_l], 'hinge_blender': [round(float(v), 5) for v in hinge(tag)], 'pivot_offset_m': dz, 'score': round(e, 4),
                      'closed_edge_above_rim_mm': None if closure is None else round(closure[0] * 1000, 2),
                      'squint_coverage': None if closure is None else round(closure[1], 3),
                      'closed_standoff_centre_mm': None if closure is None else round(closure[2] * 1000, 2),
                      'radius_centre_m': float(cols[len(cols) // 2][1]), 'target': target}
    return tuple(float(v) for v in pivot)
# ---------------------------------------------------------------- the tilted lid hinges (HERO_MODELS lidTilt, rig review 2)
# The game turns lidU / lidD about each eye's own sideways axis: Blender (cos t, +sin t, 0) for her left (+X) eye and
# (cos t, -sin t, 0) for the right (animator.js lidTurn), t = LID_TILT. Each lid is designed in its eye's own frame (the head and
# the eye turned about the vertical through the eye's surface centre so the eye faces -Y and the hinge is X; the Shih Tzu
# technique), with the lid construction above unchanged, then turned back.
LID_TILT = float(os.environ.get('LID_TILT', '.534'))
HEAD_SDF_W = head_sdf; FRONT_HIT_W = front_hit; GRAD_N_W = ns['grad_n']; EYE_S_W = ns['eye_s']; EYE_XZ_W = ns['eye_xz']
EX_W, EZ_W, EHW_W, EHH_W = EX, EZ, EHW, EHH
def Rz(phi):
    c, s_ = math.cos(phi), math.sin(phi); return np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1.]])
EYE_FRAME = {}
for tag_, s_ in (('L', 1), ('R', -1)):
    Sc_ = np.array([s_ * EX_W, float(FRONT_HIT_W(s_ * EX_W, EZ_W)[0]), EZ_W]); ax_ = GRAD_N_W(Sc_[None])[0]
    EYE_FRAME[tag_] = {'Sc': Sc_, 's': s_, 'a_measured': math.atan2(s_ * ax_[0], -ax_[1]), 'Rw': Rz(s_ * LID_TILT), 'Rl': Rz(-s_ * LID_TILT)}
def hinge(tag): return EYE_FRAME[tag]['Rw'] @ np.array([1., 0, 0])
def to_world(q, tag):
    f_ = EYE_FRAME[tag]; q = np.asarray(q, float); return f_['Sc'] + (q - f_['Sc']) @ f_['Rw'].T
def to_local(p, tag):
    f_ = EYE_FRAME[tag]; p = np.asarray(p, float); return f_['Sc'] + (p - f_['Sc']) @ f_['Rl'].T
def rot_axis(V, Pv, axis, ang):
    k = np.asarray(axis, float) / np.linalg.norm(axis); d = np.asarray(V, float) - Pv
    c, s_ = math.cos(ang), math.sin(ang)
    return Pv + d * c + np.cross(k, d) * s_ + np.outer(d @ k, k) * (1 - c)
print('LID_TILT', LID_TILT, 'eye facing measured', {t: round(EYE_FRAME[t]['a_measured'], 4) for t in 'LR'}, 'hinge L', hinge('L').round(4).tolist(), flush=True)
HV_ = np.array([v.co[:] for v in head.data.vertices]); HT_ = [tuple(t.vertices) for t in head.data.loop_triangles]
SWAP = {}
def enter(tag):
    f_ = EYE_FRAME[tag]; s_ = f_['s']; g = globals()
    def hsdf_l(q):
        q = np.asarray(q, float); return np.asarray(HEAD_SDF_W(to_world(q.reshape(-1, 3), tag))).reshape(q.shape[:-1])
    def front_hit_l(x, z, f=None): return FRONT_HIT_W(x, z, f if f is not None else hsdf_l)
    def grad_n_l(p, f=None, e=1.5e-4): return GRAD_N_W(p, f if f is not None else hsdf_l, e)
    sk_t = BVHTree.FromPolygons([Vector(p) for p in to_local(HV_, tag)], HT_)
    eo = OBJ['Mochi_eye_' + tag]; EVl = to_local(np.array([list(v.co) for v in eo.data.vertices]), tag)
    ey_t = BVHTree.FromPolygons([Vector(p) for p in EVl], [tuple(p.vertices) for p in eo.data.polygons])
    ps = np.linspace(0, 2 * math.pi, 120, endpoint=False); rx, rz = EYE_XZ_W(s_, ps)       # the eyelid hole's rim, in the eye's frame
    rim = to_local(np.stack([rx, FRONT_HIT_W(rx, rz), rz], -1), tag)
    EXl = abs(float(rim[:, 0].max() + rim[:, 0].min()) / 2); EZl = float(rim[:, 2].max() + rim[:, 2].min()) / 2
    EHWl = float(rim[:, 0].max() - rim[:, 0].min()) / 2; EHHl = float(rim[:, 2].max() - rim[:, 2].min()) / 2
    def eye_xz_l(side, psi, k=1.0):
        ux, uz = ns['eye_unit'](psi); return side * EXl + side * EHWl * k * ux, EZl + EHHl * k * uz
    def eye_s_l(side, x, z):
        X = side * (np.asarray(x) - side * EXl) / EHWl; Z = (np.asarray(z) - EZl) / EHHl
        return (np.abs(X) ** EN + np.abs(Z) ** EN) ** (1 / EN), np.arctan2(Z, X), X, Z
    for k_, v_ in (('front_hit', front_hit_l), ('head_sdf', hsdf_l), ('skin_tree', sk_t), ('eye_tree', {tag: ey_t}),
                   ('EX', EXl), ('EZ', EZl), ('EHW', EHWl), ('EHH', EHHl)):
        SWAP[k_] = g[k_]; g[k_] = v_
    for k_, v_ in (('eye_s', eye_s_l), ('eye_xz', eye_xz_l), ('grad_n', grad_n_l)):
        SWAP['ns:' + k_] = ns[k_]; ns[k_] = v_
    rx_, rz_ = eye_xz_l(s_, np.linspace(0, 2 * math.pi, 72, endpoint=False), 1.02)
    SWAP['RIM_N'] = dict(RIM_N); RIM_N[tag] = (np.stack([rx_, rz_], -1), grad_n_l(np.stack([rx_, front_hit_l(rx_, rz_), rz_], -1)))
    print('EYE_FRAME', tag, 'fit EX EZ EHW EHH', [round(v, 4) for v in (EXl, EZl, EHWl, EHHl)], flush=True)
def leave():
    g = globals()
    for k_, v_ in SWAP.items():
        if k_.startswith('ns:'): ns[k_[3:]] = v_
        elif k_ == 'RIM_N': RIM_N.clear(); RIM_N.update(v_)
        else: g[k_] = v_
    SWAP.clear()
for tag in 'LR':
    enter(tag)
    try:
        P['lidU_' + tag] = lid_shell(tag, True)
        P['lidD_' + tag] = lid_shell(tag, False)
    finally:
        leave()


# the lid charts: her own face paint (lash lines off) under each lid point at its target pose, so a closed or squinting lid is
# the skin it covers (her right lid is orange where the calico patch covers the eye's top); the upper lid carries the thick
# lash line on its edge, the lower a soft crease line
RIB_T, RIB_COL, WING_TIP = float(os.environ.get('MOCHI_RIB_T', '.018')), '#2a1a14', .58; RIB_DIAG = {}
WING_LEN, WING_RISE, WING_A0, WING_A1 = .060, 0., 18., 52.     # the shut wing: .06 W long on screen, rising 18 -> 52 deg (an eyeliner flick)
RIB_X1 = float(os.environ.get('MOCHI_RIB_X1', '.80'))                       # the ribbon's outer end (the wing takes over there)
RIB_ZC = float(os.environ.get('MOCHI_RIB_ZC', '.32'))   # the ribbon's top in front view: at most this far (EHH) above the rim (no strip up the lid's side)
def paint_lids():
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    w_, h_ = img.size; px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    rgb, mix = ns['rgb'], ns['mix']
    for chart, info in LID_PAINT.items():
        x0, y0, w, h = ns['CHARTS'][chart]
        U, Vv = np.meshgrid(np.clip((np.arange(w) - 6) / (w - 12), 0, 1), np.clip((np.arange(h) - 6) / (h - 12), 0, 1))
        G = info['G']; A = info['arc']; rows = info['rows']; nc = G.shape[0]
        fi = U * (nc - 1); i0 = np.clip(np.floor(fi).astype(int), 0, nc - 2); a = fi - i0
        j0 = np.clip(np.searchsorted(rows, Vv, side='right') - 1, 0, len(rows) - 2); b = (Vv - rows[j0]) / (rows[j0 + 1] - rows[j0])
        def bil(F):
            F = np.asarray(F); e = (Ellipsis,) + (None,) * (F.ndim - 2)
            return (F[i0, j0] * ((1 - a) * (1 - b))[e] + F[i0 + 1, j0] * (a * (1 - b))[e]
                    + F[i0, j0 + 1] * ((1 - a) * b)[e] + F[i0 + 1, j0 + 1] * (a * b)[e])
        Pp = bil(G).reshape(-1, 3); arc = bil(A); tg = info['tag']
        ns['PAINT_OPTS']['lash'] = False
        patch0 = list(ns['PATCH_FACE'])
        if chart.startswith('lidU'):
            # the patch's traced edge runs ~1.3 cm above the eye's lower rim (hidden by the open eye): on the shut lid it
            # would leave a cream strip over the lash line, so the upper lid takes the patch right down to below the eye
            ns['PATCH_FACE'][:] = [(x, min(z, .160)) if (-.44 < x < -.12 and z < .245) else (x, z) for x, z in patch0]
        else:
            # the lower lid rises from the cheek: paint it from where it rests (the game's neutral -0.10, under the rim)
            piv = info['pivot_local']; dlt = -.10 - info['target']
            d_ = Pp - piv; c_, s_ = math.cos(dlt), math.sin(dlt)
            Pp = np.stack([d_[:, 0], d_[:, 1] * c_ - d_[:, 2] * s_, d_[:, 1] * s_ + d_[:, 2] * c_], -1) + piv
        Pp = to_world(Pp, tg)
        C = np.asarray(ns['paint_head_P'](Pp)).reshape(h, w, 3)
        ns['PATCH_FACE'][:] = patch0
        ns['PAINT_OPTS']['lash'] = True
        if chart.startswith('lidU'):
            dk = info['dark'][i0] * (1 - a) + info['dark'][i0 + 1] * a
            tk = info['tuck'][i0] * (1 - a) + info['tuck'][i0 + 1] * a
            # the lash line at the lid's edge (the squint), and the same line where the lid meets the lower rim when shut
            # (a tuck above the edge: at the squint it reads as a soft lid crease, or sits above the eye where the tuck is big)
            e1 = (1 - smooth(dk - .0006, dk + .0006, arc)).reshape(-1)
            # rig review 3 (shut eye): one solid lash ribbon on the shut lid's lower edge, sized in screen space at the game
            # camera (yaw 0, 35.5 deg down): from the lower rim (and the tuck under it) up RIB_T, inner corner to the wing, from
            # the lid's real shut shape (after the caps)
            s_ = 1 if chart[-1] == 'L' else -1
            ob_ = next(o for o, b in lid_objects if b == 'lidU_' + tg); piv_ = np.array(P['lidU_' + tg])
            Vo_ = np.array([list(v.co) for v in ob_.data.vertices])
            Gs = rot_axis(Vo_, piv_, hinge(tg), 1.22).reshape(nc, len(rows), 3); Ps = bil(Gs).reshape(-1, 3)
            el_ = math.radians(35.5); up_ = np.array([0., math.sin(el_), math.cos(el_)])
            Xt = s_ * (Ps[:, 0] - s_ * EX) / EHW; Zt = (Ps[:, 2] - EZ) / EHH
            # drawn in the game camera's screen (yaw 0, 35.5 deg down): the shut lid's lowest visible line (where it comes out of
            # the skin, column by column) is the ribbon's lower edge; the ribbon is RIB_T * W thick above it on screen, then the
            # wing flicks out and up from its outer end, on the cover pieces
            Xc = info['X']; Ac = A; tkc = info['tuck']
            scr = lambda Q: np.stack([s_ * Q[..., 0], Q[..., 1] * up_[1] + Q[..., 2] * up_[2]], -1)     # (outward, up) on screen
            B = []
            for ci in range(nc):
                if not (-.93 <= Xc[ci] <= RIB_X1): continue
                sd_ = head_sdf(Gs[ci]); ok = np.where((sd_ > .0002) & (Ac[ci] >= tkc[ci] - 1e-6))[0]
                if not len(ok): continue
                j = int(ok[0]); q = Gs[ci, j]
                if j > 0:                                    # interpolate to the skin crossing
                    f_ = float(np.clip(sd_[j] / max(sd_[j] - sd_[j - 1], 1e-9), 0, 1)); q = Gs[ci, j] + (Gs[ci, j - 1] - Gs[ci, j]) * f_
                B.append((Xc[ci], scr(q)))
            B.sort(key=lambda t_: t_[0]); Bx = np.array([b_[0] for b_ in B]); Bp = np.array([b_[1] for b_ in B])
            T = RIB_T * W
            hwB = T * (.30 + .70 * smooth(-.93, -.55, Bx))                      # tapering into the inner corner (no hook)
            # the wing: from the ribbon's middle height at the outer end, out and up (25 deg at the root, 60 deg at the tip)
            tw = np.linspace(0, 1, 12); ang = np.radians(WING_A0 + (WING_A1 - WING_A0) * tw ** 1.3)
            L_ = WING_LEN * W; seg = np.stack([np.cos(ang), np.sin(ang)], -1) * (L_ / (len(tw) - 1))
            W0 = Bp[-1] + np.array([0., .5 * hwB[-1]]); Wp = W0 + np.vstack([[0, 0], np.cumsum(seg[1:], 0)])
            hwW = (.5 * hwB[-1] + .22 * T) * (1 - tw) ** .8 + .0012 * W
            St = scr(Ps); aa = .0006
            rib = ns['stroke'](St[:, 0], St[:, 1], Bp, hwB, aa) * float(1)
            aw = ns['stroke'](St[:, 0], St[:, 1], Wp, hwW, aa)
            C = mix(C, rgb(RIB_COL), np.maximum(np.maximum(e1, rib), aw).reshape(h, w))
            RIB_DIAG[chart] = {'boundary_cols': len(B), 'outer_end_X': round(float(Bx[-1]), 3), 'inner_end_X': round(float(Bx[0]), 3)}
        else:
            C = mix(C, rgb('#c99a8a'), .55 * np.exp(-((arc - .0006) / .0011) ** 2))     # a soft crease along the raised edge
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'mochi-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
def cap_lid(o, bname):
    """the lower lid's outer corner: any point that stands proud of the skin outside the eye's opening (front projection) at the
    happy angles is pulled in toward the tilted hinge, under the skin (only radii shrink; the shell stays rigid)"""
    tag = bname[-1]; s_ = 1 if tag == 'L' else -1; piv = np.array(P[bname]); k = hinge(tag); V = np.array([list(v.co) for v in o.data.vertices])
    c = V - piv; ax = np.outer(c @ k, k); rad = c - ax; r = np.linalg.norm(rad, axis=1); u = rad / r[:, None]
    r_new = r.copy(); n_pull = 0
    n_hug = 0
    for it in range(6):
        moved = 0
        for a in LOW_CAP_ANGS:
            Vr = rot_axis(piv + ax + u * r_new[:, None], piv, k, a); sd = head_sdf(Vr)
            sr = ns['eye_s'](s_, Vr[:, 0], Vr[:, 2])[0]
            bad = (sd > -.0004) & (sr > 1.0)
            r_new[bad] -= sd[bad] + .0008; moved += int(bad.sum())
        n_pull += moved
        if not moved: break
    nr_ = 13; nc_ = len(V) // nr_; raw = (r - r_new).reshape(nc_, nr_); sh = raw.copy()
    for _ in range(10):                                      # rig review 3: a smooth pull (single pulled vertices tore the edge)
        p_ = np.pad(sh, 1, mode='edge'); sh = .2 * (p_[1:-1, 1:-1] + p_[:-2, 1:-1] + p_[2:, 1:-1] + p_[1:-1, :-2] + p_[1:-1, 2:])
        sh = np.maximum(sh, raw)
    V24 = rot_axis(V, piv, k, -.24); inside = (ns['eye_s'](s_, V24[:, 0], V24[:, 2])[0] < 1.0).reshape(nc_, nr_)
    sh = np.where(inside & (raw <= 0), np.minimum(sh, LOW_HUG - .0006), sh)     # over the opening: never into the eye
    r_new = r - sh.ravel()
    for v, p_ in zip(o.data.vertices, piv + ax + u * r_new[:, None]): v.co = Vector(p_)
    o.data.update()
    return {'hugs': n_hug, 'pulls': n_pull, 'max_shrink_mm': round(float((r - r_new).max()) * 1000, 1)}
def cap_upper(o, bname, sq=.488, keep=(.62, .74, .9, 1.05, 1.22)):
    """rig review 3: over the eyeball at the happy squint the upper lid stands at most 3 mm off it (it floated up to 17 mm at the
    outer half, so from the raised game camera it hung over the eye and the visible edge read low at the outer corner); a vertex
    never shrinks below the eyeball at any angle up to the blink. Only radii about the tilted hinge change: the shell stays rigid."""
    tag = bname[-1]; piv = np.array(P[bname]); k = hinge(tag); V = np.array([list(v.co) for v in o.data.vertices])
    c = V - piv; ax = np.outer(c @ k, k); rad = c - ax; r = np.linalg.norm(rad, axis=1); u = rad / r[:, None]
    def d_eye(a):
        ua = rot_axis(u, np.zeros(3), k, a); d = np.full(len(V), -1.)
        for i in range(len(V)):
            o_ = piv + ax[i] + ua[i] * (r[i] + .06); h = eye_tree[tag].ray_cast(Vector(o_), Vector(-ua[i]), r[i] + .06)
            if h[0] is not None: d[i] = r[i] + .06 - h[3]
        return d
    d_sq = d_eye(sq); dmax = d_sq.copy()
    for a in keep: dmax = np.maximum(dmax, d_eye(a))
    sel = (d_sq > 0) & (r > d_sq + .003)
    r_new = r.copy(); r_new[sel] = np.maximum(d_sq[sel] + .003, dmax[sel] + .0008)
    nr_ = len(ROWS8); nc_ = len(V) // nr_
    sh = (r - r_new).reshape(nc_, nr_)                       # smooth the shrink over the lid grid (no jagged lash edge)
    for _ in range(12):
        p_ = np.pad(sh, 1, mode='edge'); sh = .2 * (p_[1:-1, 1:-1] + p_[:-2, 1:-1] + p_[2:, 1:-1] + p_[1:-1, :-2] + p_[1:-1, 2:])
        sh = np.maximum(sh, (r - r_new).reshape(nc_, nr_) * .85)
    r_new = r - sh.ravel()
    floor = np.where(dmax > 0, dmax + .0008, -9.); r_new = np.maximum(r_new, floor)
    for v, p_ in zip(o.data.vertices, piv + ax + u * r_new[:, None]): v.co = Vector(p_)
    o.data.update()
    return {'capped': int((r_new < r - 1e-6).sum()), 'max_shrink_mm': round(float((r - r_new).max()) * 1000, 1)}
UCAPS = {o.name: cap_upper(o, b) for o, b in lid_objects if b.startswith('lidU') and os.environ.get('MOCHI_UPCAP', '1') == '1'}
print('UPPER_CAPS', json.dumps(UCAPS), flush=True)
CAPS = {o.name: cap_lid(o, b) for o, b in lid_objects if b.startswith('lidD') and os.environ.get('MOCHI_LOWCAP', '1') == '1'}
print('LID_CAPS', json.dumps(CAPS), flush=True)
paint_lids()
print('RIBBON', json.dumps(RIB_DIAG), flush=True)

# ---------------------------------------------------------------- mouth: part the skin along the painted "w", add the cavity
def smile_z(x):
    t = min(abs(x) / MHW, 1.0); return CHIN + (.130 + .027 * ((t - .5) / .5) ** 2) * W
CUT = .94 * MHW
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Mochi_head']; uvl = old.uv_layers.active.data
verts = []; vlab = []; vkind = []; faces = []; fuv = []; fno = []; cache = {}; seam = []
def addv(rec, kind):
    co, uv, no, lab = rec
    if kind is None: kind = 'lower' if (lab == 'mochi_head_skin' and co.z < smile_z(co.x)) else 'upper'
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
    skin = rr[0][3] == 'mochi_head_skin'
    cut = skin and max(r[0].y for r in rr) < HY - .10 and max(abs(r[0].x) for r in rr) < CUT and min(f) < 0 < max(f)
    if cut: emit(clip(rr, True), 'upper'); emit(clip(rr, False), 'lower')     # the seam: coincident upper / lower rims
    else: emit(rr, None)
me = bpy.data.meshes.new('Mochi_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, u in zip(poly.loop_indices, uu): layer.data[l].uv = u
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < .0003) & np.array([l_ == 'mochi_head_skin' for l_ in FL])
FN[onsk] = ns['grad_n'](FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Mochi_head'] = vlab
seam = sorted(set(tuple(round(c, 7) for c in p) for p in seam), key=lambda p: p[0])
rim = []
for p in seam:
    if not rim or p[0] - rim[-1][0] > .0016: rim.append(p)
assert len(rim) >= 10, len(rim)
LOG = {'mouth_seam_points': len(rim)}

# ---------------------------------------------------------------- weights
def lip_w(x, z):
    return .85 * math.exp(-((abs(x) - MHW) / (.034 * W)) ** 2 - ((z - corner_z) / (.034 * W)) ** 2)
def jaw_w(x, y, z, kind):
    q = M2L(np.array([x, y, z])); xl, yl, zl = q; b = yl - NOSE_TIP_L
    sharp = 1.0 if kind == 'lower' else 0.0
    field = 1 - sm(-.006 * W, .010 * W, z - smile_z(x))           # the whole skin around the sealed corners
    we = sm(.74 * CUT, CUT, abs(x)); below = sharp * (1 - we) + field * we
    lat = 1 - sm(.10, .24, abs(xl)); back = 1 - sm(.36, .48, b)
    return below * lat * back
def face_weights(p, lab, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    q = M2L(np.array(p)); zl = q[2]; b = q[1] - NOSE_TIP_L
    lip = lip_w(x, z) * (1 - sm(-.22, -.12, y - HY))
    jw = jaw_w(x, y, z, kind)
    neck = sm(.06, -.01, zl) * sm(.30, .45, b) * .5                # the hidden underside rides a little with the neck
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
ARMS = {tag: ns['joint_arms'][tag] for tag in 'LR'}
ARM_D = {tag: np.array([(1 if tag == 'L' else -1) * math.sin(ns['ARM_ANG']), 0, -math.cos(ns['ARM_ANG'])]) for tag in 'LR'}
def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab.endswith('.L'): side = 'L'
    if lab.endswith('.R'): side = 'R'
    if lab == 'kimono_torso':
        chest = sm(.39, .45, z); top = sm(.495, .535, z)
        arm = .25 * sm(.09, .13, abs(x)) * sm(.42, .46, z) * (1 - top)
        return {'spine': (1 - chest) * (1 - top), 'chest': chest * (1 - top) * (1 - arm), 'upperarm_' + side: chest * arm,
                'neck': .6 * top, 'head': .4 * top}
    if lab.startswith('collar_band'):
        r = sm(.495, .530, z); return {'chest': 1 - r, 'neck': .6 * r, 'head': .4 * r}
    if lab == 'obi_sash':
        sp = sm(.300, .375, z); return {'hips': 1 - sp, 'spine': sp}             # the lower edge stays with the skirt top
    if lab in ('obi_back_knot', 'brush_handle', 'brush_ferrule', 'brush_bristles'): return {'spine': 1}   # rigid to the obi
    if lab == 'a_line_skirt':
        th = .40 * (1 - sm(.17, .29, z)); sp = .35 * sm(.255, .300, z)             # the top tucked under the obi rides with it
        wl = th * float(np.clip(.5 + x / .24, 0, 1)); wr = th - wl
        return {'hips': 1 - th - sp, 'spine': sp, 'thigh_L': wl, 'thigh_R': wr}
    if lab.startswith('kimono_sleeve'):
        t = float((np.array(p) - np.array(ARMS[side]['shoulder'])) @ ARM_D[side])
        chest = .30 * (1 - sm(-.04, .05, t)); return {'chest': chest, 'upperarm_' + side: 1 - chest}
    if lab.startswith('short_arm'):
        t = float((np.array(p) - np.array(ARMS[side]['shoulder'])) @ ARM_D[side])
        fore = sm(.08, .16, t); hand = sm(.205, .235, t); chest = .10 * (1 - sm(-.03, .03, t))
        return {'chest': chest, 'upperarm_' + side: (1 - chest) * (1 - fore), 'forearm_' + side: (1 - chest) * fore * (1 - hand),
                'hand_' + side: (1 - chest) * fore * hand}
    if lab.startswith('mitten_paw'): return {'hand_' + side: 1}
    if lab.startswith('rounded_foot'): return {'foot_' + side: 1}
    if lab.startswith('stubby_leg'):
        hips = sm(.225, .265, z); shin = 1 - sm(.125, .175, z); foot = 1 - sm(.062, .085, z)
        return {'hips': hips, 'thigh_' + side: (1 - hips) * (1 - shin), 'shin_' + side: (1 - hips) * shin * (1 - foot), 'foot_' + side: (1 - hips) * shin * foot}
    raise KeyError(lab)
def ear_weights(p, s):
    E = ns['ear_info'][s]; tag = 'L' if s > 0 else 'R'
    hz = float((np.asarray(p) - E['S']) @ E['w']) / float(np.linalg.norm(E['T'] - E['S']))
    tip = sm(.40, .80, hz); return {'ear_' + tag: 1 - tip, 'earTip_' + tag: tip}
def tail_weights(p):
    s_ = nearest_s(p); bl = .035; w = {}
    h = 1 - sm(TAIL_S[0] - .06, TAIL_S[0], s_)                       # inside the skirt it eases into the hips
    k = [sm(TAIL_S[i] - bl, TAIL_S[i] + bl, s_) for i in range(1, 4)]
    w['tail1'] = (1 - h) * (1 - k[0]); w['tail2'] = (1 - h) * k[0] * (1 - k[1]); w['tail3'] = (1 - h) * k[1] * (1 - k[2]); w['tail4'] = (1 - h) * k[2]
    w['hips'] = h; return w

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
adata = bpy.data.armatures.new('Mochi_game_skeleton'); arm = bpy.data.objects.new('Mochi_Rig', adata); bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in HERO:
    b = adata.edit_bones.new(name); b.head = P[name]; b.tail = Vector(P[name]) + Vector((0, .04, 0)); b.roll = 0
    if PARENT[name]: b.parent = adata.edit_bones[PARENT[name]]
    b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for b in arm.pose.bones: b.rotation_mode = 'YZX'          # = three.js 'XYZ' order under the game axis mapping
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
            pz = z + (.010 * W if level == 'upper' else -.040 * W) * math.sin(t * math.pi * .5) * corner
            py = y + .0015 + .085 * W * t * (.35 + .65 * corner)
            px = x * (1 - .06 * t)
            if j: py = max(py, skin_front(px, pz) + .005)
            cav_v.append((px, py, pz))
            ww = face_weights((x, y, z), 'mochi_head_skin', level)
            if level == 'upper': ww = {'head': 1 - ww['lip_' + ('L' if x >= 0 else 'R')], 'lip_' + ('L' if x >= 0 else 'R'): ww['lip_' + ('L' if x >= 0 else 'R')]}
            cav_w.append(ww)
for k in range(2):
    off = k * (D + 1) * n
    for j in range(D):
        for i in range(n - 1): cav_f.append((off + j * n + i, off + j * n + i + 1, off + (j + 1) * n + i + 1, off + (j + 1) * n + i))
for i in range(n - 1): cav_f.append((D * n + i, D * n + i + 1, (2 * D + 1) * n + i + 1, (2 * D + 1) * n + i))   # back wall
for i in (0, n - 1):
    for j in range(D): cav_f.append((j * n + i, (j + 1) * n + i, (D + 2 + j) * n + i, (D + 1 + j) * n + i))
def make_mesh(name, coords, polys, chart):
    me = bpy.data.meshes.new(name); me.from_pydata(coords, [], polys); me.update(); layer = me.uv_layers.new(name='Atlas')
    for p in me.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer.data[l].uv = au(chart, .5, .5)
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT); return ob
mouth = make_mesh('Mochi_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
cc = Vector((0, rim[len(rim) // 2][1] + .03, MC))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()        # faces look into the pocket
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .030
tongue_c = (0, ty, CHIN + .125 * W)
ns['parts']['head'] = []
tongue = ns['blob']('Mochi_tongue', tongue_c, (.055 * W, .040 * W, .011 * W), 'tongue', 'head', 12, 6)
for l in tongue.data.uv_layers.active.data: l.uv = au('tongue', .5, .5)
tongue.data.materials.clear(); tongue.data.materials.append(MAT)

# ---------------------------------------------------------------- bind
def bind(o, weights):
    o.vertex_groups.clear(); groups = {b: o.vertex_groups.new(name=b) for b in HERO}
    for v, ww in zip(o.data.vertices, weights):
        pairs = sorted([(b, float(w)) for b, w in ww.items() if w > 1e-4], key=lambda t: (-t[1], t[0]))[:4]
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
    if o.name == 'Mochi_head': weights = [face_weights(p, l, k) for p, l, k in zip(pp, lab, vkind)]
    elif o.name.startswith('Mochi_eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    elif o.name.startswith('Mochi_ear_'): weights = [ear_weights(p, 1 if o.name[-1] == 'L' else -1) for p in pp]
    elif o.name == 'Mochi_tail': weights = [tail_weights(p) for p in pp]
    else: weights = [body_weights(p, l) for p, l in zip(pp, lab)]
    bind(o, weights); objects.append(o)
bind(mouth, cav_w); bind(tongue, [{'jaw': 1} for v in tongue.data.vertices]); objects += [mouth, tongue]
for o, b in lid_objects: bind(o, [{b: 1} for v in o.data.vertices]); objects.append(o)

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
def lid_sweep(o, bname):
    tag = bname[-1]; s_ = 1 if tag == 'L' else -1; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
    out = {}
    angs = np.round(np.linspace(0, 1.22, 13), 3) if bname.startswith('lidU') else np.round([-.10, -.18, -.26], 3)
    for a in angs:
        Vr = rot_axis(V, piv, hinge(tag), a)
        sd = head_sdf(Vr); sr, psi_, X_, Z_ = ns['eye_s'](s_, Vr[:, 0], Vr[:, 2])
        th = ns['lash_th'](psi_); band = (Z_ > -.05) & (sr <= 1.05 + th)
        esd = np.array([eye_sd(p, tag) for p in Vr])
        near = sd > -.006
        flap = (sr > 1.02) & (sd > .0003) & ~band
        flap_b = (sr > 1.02) & (sd > .0003) & band
        hole = (sr < .97) & (esd < -.0002) & near
        out[float(a)] = [int(flap.sum()), int(flap_b.sum()), int(hole.sum()), round(float(sd[flap].max()) * 1000, 1) if flap.any() else 0]
    return out
SWEEP = {o.name: lid_sweep(o, b) for o, b in lid_objects}
def proud(o, bname, angs):
    """lid vertices proud of the skin (> 0.5 mm) outside the eye opening, at each test angle: count, max mm, (col, row) of the worst"""
    tag = bname[-1]; s_ = 1 if tag == 'L' else -1; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices]); out = {}
    nr_ = len(ROWS8) if bname.startswith('lidU') else len(ROWS_D)
    for a in angs:
        Vr = rot_axis(V, piv, hinge(tag), a); sd = head_sdf(Vr); sr = ns['eye_s'](s_, Vr[:, 0], Vr[:, 2])[0]
        bad = (sd > .0005) & (sr > 1.0); idx = np.where(bad)[0]
        out[a] = [int(bad.sum()), round(float(sd[bad].max()) * 1000, 1) if bad.any() else 0,
                  [(int(k // nr_), int(k % nr_), round(float(sd[k]) * 1000, 1)) for k in idx[np.argsort(-sd[idx])][:5]]]
    return out
def outer_diag(o, bname):
    tag = bname[-1]; s_ = 1 if tag == 'L' else -1; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
    Vr = rot_axis(V, piv, hinge(tag), -.24); sd = head_sdf(Vr); sr = ns['eye_s'](s_, Vr[:, 0], Vr[:, 2])[0]
    sel = s_ * Vr[:, 0] > .19
    order = np.argsort(-sd[sel])[:8]; idx = np.where(sel)[0][order]
    return [(int(i // len(ROWS_D)), int(i % len(ROWS_D)), [round(float(c), 3) for c in Vr[i]], round(float(sd[i]) * 1000, 1), round(float(sr[i]), 2)) for i in idx]
print('OUTER_DIAG', json.dumps({o.name: outer_diag(o, b) for o, b in lid_objects if b.startswith('lidD')}), flush=True)
def cam_up(yaw_deg, elev_deg):
    e = math.radians(elev_deg); y = math.radians(yaw_deg)
    d = np.array([math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)])   # toward the camera
    right = np.cross(-d, [0, 0, 1.]); right /= np.linalg.norm(right); up = np.cross(right, -d); return up, right
def edge_screen(sq=.488):
    """the upper lid's visible edge at the squint, in screen height (W units) from the front and both 45 deg game cameras:
    [inner end, middle, outer end] per eye (the edge row of each column whose point lies over the opening)"""
    out = {}
    for o, bname in lid_objects:
        if not bname.startswith('lidU'): continue
        tag = bname[-1]; s_ = 1 if tag == 'L' else -1; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
        nr = len(ROWS8); E = rot_axis(V[0::nr], piv, hinge(tag), sq)           # row 0 = the edge of every column
        sr = EYE_S_W(s_, E[:, 0], E[:, 2])[0]; vis = sr < .98
        if not vis.any(): out[tag] = None; continue
        Ev = E[vis]; order = np.argsort(s_ * Ev[:, 0]); Ev = Ev[order]      # inner (nose) -> outer
        res = {}
        for name, (yaw, el) in (('front', (0, 0)), ('game0', (0, 35.5)), ('game+45', (45, 35.5)), ('game-45', (-45, 35.5))):
            up, right = cam_up(yaw, el); h = Ev @ up / W
            res[name] = {'inner': round(float(h[0]), 3), 'mid': round(float(h[len(h) // 2]), 3), 'outer': round(float(h[-1]), 3),
                         'outer_minus_inner_W': round(float(h[-1] - h[0]), 3)}
        out[tag] = res
    return out
for sq_ in (.488, .38, .30): print('EDGE_SCREEN', sq_, json.dumps(edge_screen(sq_)), flush=True)
print('PROUD', json.dumps({o.name: proud(o, b, [.488, .74, 1.22] if b.startswith('lidU') else [-.10, -.24, -.36]) for o, b in lid_objects}), flush=True)
print('LID_SWEEP', json.dumps(SWEEP), flush=True)
sd = head_sdf(np.array([list(v.co) for v in tongue.data.vertices]))
hidden['Mochi_tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
assert hidden['Mochi_tongue@rest']['outside_count'] == 0, hidden['Mochi_tongue@rest']
def normal_audit():
    me = head.data; me.calc_loop_triangles()
    V = np.array([v.co[:] for v in me.vertices]); lv = np.empty(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    CN = np.empty(len(me.loops) * 3); me.corner_normals.foreach_get('vector', CN); CN = CN.reshape(-1, 3)
    lab = np.array([labels['Mochi_head'][i] == 'mochi_head_skin' for i in lv]); Pc = V[lv]
    on = lab & (np.abs(head_sdf(Pc)) < .0003)
    vis = on & (Pc[:, 1] < HY + .01) & (Pc[:, 2] > CHIN + .02 * W)
    ang_c = np.degrees(np.arccos(np.clip((ns['grad_n'](Pc[vis]) * CN[vis]).sum(1), -1, 1)))
    st = lambda x: {'mean': round(float(x.mean()), 3), 'p95': round(float(np.percentile(x, 95)), 3), 'p99': round(float(np.percentile(x, 99)), 3), 'max': round(float(x.max()), 3)}
    return {'corner_normals_vs_analytic_deg': {'n': int(len(ang_c)), **st(ang_c), 'over_2deg': int((ang_c > 2).sum())}}
NORMALS = normal_audit(); print('NORMAL_AUDIT', json.dumps(NORMALS), flush=True)
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'mochi-toy_rig.blend'))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]]} for b in HERO],
       'triangles': total, 'lidTilt': LID_TILT, 'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'}, 'lids': lid_info, 'lids_hidden_check': hidden, 'lid_sweep': SWEEP, 'normals': NORMALS, **LOG,
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids are surfaces of revolution about their bone X axis: a rotation slides them along themselves.',
                 'Weights quantized to an exact 255 sum; <= 4 influences. Ears: ear_* blending to earTip_* over the top half;'
                 ' tail: tail1-4 along its length; brush and obi knot rigid to spine; skirt on hips + up to 40% thighs at the hem, its top 35% on spine under the obi.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2))
print('MOCHI_RIG', json.dumps({'bones': len(HERO), 'triangles': total, 'hidden': hidden}), flush=True)
