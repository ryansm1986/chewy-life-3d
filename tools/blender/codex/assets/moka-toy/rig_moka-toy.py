"""Moka (moka-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, world-axis game contract.

    blender --background --factory-startup --python rig_moka-toy.py

Runs build_moka-toy.py in RIG_MODE (part labels, lid / mouth charts in unused atlas space; the approved GLB and round-3
files are not touched), then adds (after Rosie's rig):
  - the armature (exactly the hero contract, identity rest orientations, heads at the joints);
  - the mouth: the skin parted along the painted "w" smile between sealed corners, a closed cavity and a tongue;
  - eyelids: rigid shells that are surfaces of revolution about their bone's X axis, just outside the eyeball and lash band;
  - weights (spatial fields + part labels, <= 4 influences, quantized to an exact 255 sum);
and saves moka-toy_rig.blend with only Armature modifiers left, plus joints-rig.json (bones, staff grip in game axes).
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'build_moka-toy.py').read_text(encoding='utf-8')
ns = {'__file__': str(ROOT / 'build_moka-toy.py'), '__name__': 'moka_model', 'RIG_MODE': True}
exec(compile(src, str(ROOT / 'build_moka-toy.py'), 'exec'), ns)
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MZ, MHW = ns['MZ'], ns['MHW']
smooth, au, MAT, M2L = ns['smooth'], ns['au'], ns['MAT'], ns['M2L']
head_sdf, front_hit = ns['head_sdf'], ns['front_hit']
NOSE_TIP_L = ns['NOSE_TIP_L']
def sm(a, b, x): return float(smooth(a, b, x))

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

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
JB = ns['JOINTS_BODY']
ARM = {s: {'upperarm': tuple(JB['arms'][t]['shoulder']), 'forearm': tuple(JB['arms'][t]['elbow']), 'hand': tuple(JB['arms'][t]['wrist'])}
       for s, t in ((1, 'L'), (-1, 'R'))}
LEG = {s: {'thigh': (s * .102, .006, .330), 'shin': tuple(JB['legs'][t]['knee']), 'foot': tuple(JB['legs'][t]['ankle'])}
       for s, t in ((1, 'L'), (-1, 'R'))}
def smile_z(x):
    t = min(max((abs(x) - .006 * W) / (MHW - .006 * W), 0.), 1.)
    return MZ + .006 * W - .026 * W * math.sin(math.pi * t) ** 1.1 + .020 * W * t ** 3
neck_c = ns['L2M'](np.array(ns['NECK'][0]))
mouth_y = float(front_hit(0., MZ)[0]); corner_z = smile_z(MHW)
P = {'root': (0, -.010, 0), 'hips': (0, .006, .365), 'spine': (0, .000, .470), 'chest': (0, -.006, .590),
     'neck': (0, float(neck_c[1]), .675),
     'head': (0, float(neck_c[1]) + .045, .690),                         # skull base: the nod pivot at the back of the neck
     'jaw': (0, mouth_y + .22 * W, corner_z)}                             # the hinge inside the head, 0.22 W behind the smile
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * ns['BROW_X'], float(front_hit(s * ns['BROW_X'], ns['BROW_Z'])[0]) + .012, ns['BROW_Z'])
    P['lip_' + tag] = (s * MHW, float(front_hit(s * MHW, corner_z)[0]) + .002, corner_z)
    P['ear_' + tag] = tuple(ns['ear_info'][tag]['base'])                                   # the root, under the brim
    P['earTip_' + tag] = tuple(ns['loc'](s * float(ns['ear_axis_x'](-.08)), .880, -.080))  # halfway down, just above the ribbon
    for k, v in ARM[s].items(): P[k + '_' + tag] = v
    for k, v in LEG[s].items(): P[k + '_' + tag] = v
TB = JB['tail']
for i in range(4): P['tail%d' % (i + 1)] = tuple(TB[i])

# ---------------------------------------------------------------- BVHs of the approved skin and eyes
head = OBJ['Moka_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Moka_eye_' + t].data.vertices],
                                    [tuple(p.vertices) for p in OBJ['Moka_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
def front_y(x, z, tag):
    a = ray_y(eye_tree[tag], x, z); b = ray_y(skin_tree, x, z)
    c = [v for v in (a, b) if v is not None]; return min(c) if c else None

# ---------------------------------------------------------------- eyelids: rigid shells about the bone X axis (Rosie's construction)
def outline_z(X, top):
    a = np.clip(np.abs(X), 0, 1); return EZ + (1 if top else -1) * EHH * (1 - a ** EN) ** (1 / EN)
def skin_dist(x, pivot, phs):
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
    out = []
    for ph in phs:
        d = Vector((0, -math.cos(ph), math.sin(ph))); o = Vector((x, pivot[1], pivot[2]))
        h = eye_tree[tag].ray_cast(o + d * .34, -d, .34)
        out.append(.34 - h[3] if h[0] is not None else 0.)
    return np.array(out)
ROWS_U = [0, .03, .06, .09, .12, .155, .20, .26, .33, .42, .53, .66, .82, 1.0]
ROWS_D = [0, .04, .10, .18, .30, .46, .66, 1.0]
lid_info = {}; lid_objects = []; LID_PAINT = {}
SQ_U = float(os.environ.get('SQ_U', '.488'))      # the happy squint the lid is designed for (the game's rig.squint[0])
RIM_N = {}; LID_NRING = float(os.environ.get('LID_NRING', '1.02'))   # skin normals sampled outside the socket's rim roll
for tag_, s_ in (('L', 1), ('R', -1)):
    ps_ = np.linspace(0, 2 * math.pi, 72, endpoint=False); rx_, rz_ = ns['eye_xz'](s_, ps_, LID_NRING)
    ry_ = front_hit(rx_, rz_); RIM_N[tag_] = (np.stack([rx_, rz_], -1), ns['grad_n'](np.stack([rx_, ry_, rz_], -1)))
LID_BANDK = float(os.environ.get('LID_BANDK', '1.075')); LID_SINK0 = float(os.environ.get('LID_SINK0', '0'))
LID_SKT = float(os.environ.get('LID_SKT', '1.03'))
LID_NR = float(os.environ.get('LID_NR', '1'))
def head_sdf_nr(p):
    q = ns['M2L'](p); d = ns['base_local'](q); d = ns['smin'](d, ns['ell'](q, *ns['NECK']), ns['K_NECK'])
    return ns['smin'](d, ns['ell'](q, *ns['NOSE']), ns['K_N']) * W
def lid_normal(p, tag):
    s_ = 1 if tag == 'L' else -1; xz, N = RIM_N[tag]
    d2 = (xz[:, 0] - p[0]) ** 2 + (xz[:, 1] - p[2]) ** 2; w = 1 / (d2 + 1e-7) ** 1.5
    n = (w[:, None] * N).sum(0); n /= np.linalg.norm(n)
    sr = float(ns['eye_s'](s_, p[0], p[2])[0])
    if sr < 1.0 and LID_NR > 0:
        # deeper over the opening: the normal of her face as it would be with no eye socket (the closed eye is skin
        # following the face's own curve, lighter toward the cheek like the fur round it)
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
def lid_geometry(tag, upper, dz):
    s = 1 if tag == 'L' else -1
    cx = s * EX; ye = float(front_hit(cx, EZ)[0]); H = 2 * EHH
    if upper:
        zb_, zt_ = EZ - .97 * EHH, EZ + .97 * EHH
        B = np.array([ray_y(eye_tree[tag], cx, zb_), zb_]); T = np.array([ray_y(eye_tree[tag], cx, zt_), zt_])
        M_ = np.array([ray_y(eye_tree[tag], cx, EZ), EZ])
        ch = T - B; Lc = float(np.linalg.norm(ch)); u = ch / Lc; nb = np.array([u[1], -u[0]])
        if nb[0] < 0: nb = -nb
        sag = float((M_ - (B + T) / 2) @ -nb)
        R = dz                                           # Moka's eye is nearly flat vertically: the shell radius is chosen directly
        m = (B + T) / 2 + nb * math.sqrt(R * R - Lc * Lc / 4)
        yp, zp = float(m[0]), float(m[1])
    else:
        a_lev = .37 * H / .14; zp = (EZ - .40 * EHH) + dz; yp = ye + a_lev
    pivot = np.array([cx, yp, zp])
    Xs = np.linspace(-1.14, 1.0, 21) if upper else np.linspace(-.88, .88, 19)
    cols = []
    for X in Xs:
        x = cx + s * EHW * X
        zz = np.linspace(EZ - EHH * 1.06, EZ + EHH * (1.30 if upper else .55), 44)
        d_open = 0; d_band = 0
        for z in zz:
            y = front_y(x, z, tag)
            if y is None: continue
            inside_open = outline_z(X, False) - .006 * float(smooth(-.15, -.40, X)) <= z <= outline_z(X, True)   # the inner half: 6 mm past the lower rim, where the eyeball bulges
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
        for k in [k_ for k_ in range(len(cols)) if abs(cols[k_][0]) > 1.0 or k_ == len(cols) - 1]:   # beyond the corners: just under the skin
            x = cols[k][1]; yf = front_y(x, EZ, tag) or ye
            sk = float(skin_dist(x, pivot, [math.atan2(EZ - zp, yp - yf)])[0])
            cols[k][2] = (sk - gap + .0004) if cols[k][0] < 0 else min(cols[k][2], sk - gap - .002); cols[k][3] = 0
    def ang(z, r): return math.atan2(z - zp, math.sqrt(max(r * r - (z - zp) ** 2, 1e-9)))
    if upper:
        def closes(zl):
            for X, x, d_o, d_b in cols:
                r = d_o + gap
                if abs(X) <= .95 and zp + r * math.sin(ang(zl, r) - (1.22 - SQ_U)) > outline_z(X, False) - .0015: return False
            return True
        coverage = .27
        while coverage < .315 and not closes(EZ + EHH - coverage * 2 * EHH): coverage += .005
        z_level = EZ + EHH - coverage * 2 * EHH
    rows = ROWS_U if upper else ROWS_D
    target = 1.22 if upper else -.24
    if upper:
        OV_T = .0020
        U = []
        for X, x, d_o, d_b in cols:
            r0 = d_o + gap
            u = zp + r0 * math.sin(ang(outline_z(X, False) - OV_T, r0) + (1.22 - SQ_U)) if X > 0 else z_level
            U.append(max(u, z_level))
        ZS = [z_level if X <= 0 else max(z_level, min(U[j] for j in range(i, len(cols)) if cols[j][0] > 0))
              for i, (X, *_r) in enumerate(cols)]
        PE = [ang(zs_, d_o + gap) - (1.22 - SQ_U) for zs_, (X, x, d_o, d_b) in zip(ZS, cols)]
    V = []; UVs = []; NRM = []; G = []; ARC = []; RAD = []; out_cols = []; DARK = []; RIMA = []; HSPAN = []
    for i, (X, x, d_o, d_b) in enumerate(cols):
        r0 = d_o + gap
        if upper:
            pe = PE[i]; pt = ang(outline_z(X, True) + EHH * .34, r0) + .45; phT = ang(outline_z(X, True), r0)
        else:
            arch = (EZ - EHH) + EHH * (.70 - .30 * min(abs(X) / .88, 1.) ** 2)   # ~30 % at the centre, ~20 % at the corners
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
            sq = 1.22 - SQ_U
            sk_sq = skin_dist(x, pivot, [ph + sq for ph in phs]); ed = eye_dist(x, pivot, phs, tag)
            rr = [min(r, max(sk_ - .0025, e_ + .0008)) if (ph + sq > phT - .04 and ph < phT - .06) else r
                  for r, ph, sk_, e_ in zip(rr, phs, sk_sq, ed)]
        else:
            phR = ang(outline_z(X, False), r0)
            rr = [r0 - .0035 * float(smooth(phR + .01, phR - .06, ph)) for ph in phs]
        out_cols.append((x, r0, pe, pt))
        if upper:
            DARK.append(.0018 + .0052 * max(0., 1 - min(abs(X), 1.) ** 2) ** .6)       # ~her open-eye lash width, tapering
            RIMA.append((ang(outline_z(X, False), r0) - pe) * r0)                        # arc from the edge to the lower rim, closed
            HSPAN.append((ang(outline_z(X, True), r0) - (1.22 - SQ_U) - pe) * r0)        # arc of the lid seen in the squint
        g_row = []; a_row = []
        for j, (t, ph, r) in enumerate(zip(rows, phs, rr)):
            ph_rest = ph + target
            V.append((x, yp - r * math.cos(ph_rest), zp + r * math.sin(ph_rest)))
            UVs.append((i / (len(cols) - 1), t))
            pz_t = zp + r * math.sin(ph); py_t = yp - r * math.cos(ph)
            g_row.append((x, py_t, pz_t)); a_row.append(abs(ph - pe) * r0)
            nrm = lid_normal(np.array([x, py_t, pz_t]), tag)
            c, s_ = math.cos(-target), math.sin(-target)
            nb_ = np.array((nrm[0], nrm[1] * c - nrm[2] * s_, nrm[1] * s_ + nrm[2] * c))
            if upper:
                # what is hidden below her lower rim when closed is only ever seen in the squint: it takes the shading
                # normal of the squint pose there (the skin's own normal round the rim), so the squinting lid shades as skin
                hid = float(smooth(-.0004, -.0016, float(head_sdf(np.array([[x, py_t, pz_t]]))[0])))     # behind the skin when closed
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
    cands = np.array([float(v) for v in os.environ['LID_R'].split(',')] if os.environ.get('LID_R') else [.095, .105, .115, .125, .135, .150, .170]) if upper else np.linspace(0, .32, 17)
    best = None
    for dz in cands:
        try:
            g = lid_geometry(tag, upper, float(dz))
        except (ValueError, TypeError, ZeroDivisionError):
            continue
        e = rest_exposure(g[0], g[3], angs)
        if os.environ.get('LID_DIAG') and not upper: print('LID_LOW', tag, round(float(dz), 3), 'pivot', np.round(g[3], 4), 'exp_rest_-0.10_mm', round(e * 1000, 1), 'exp_at_-0.24_mm', round(rest_exposure(g[0], g[3], [-.24]) * 1000, 1), flush=True)
        if os.environ.get('LID_DIAG'): print('LID_CAND', tag, upper, round(float(dz), 3), 'pivot', np.round(g[3], 4), 'rest_exp_mm', round(e * 1000, 1), 'closure', g[7], 'r0c', round(g[4][len(g[4]) // 2][1], 4), flush=True)
        if os.environ.get('LID_DIAG') and upper:
            pt_ = g[8]; ok_ = (np.abs(pt_['X']) <= .95) & (pt_['hspan'] > 0)
            print('LID_MARGIN', tag, round(float(dz), 3), 'min_rim_arc_mm', round(float(pt_['rim_arc'][np.abs(pt_['X']) <= .95].min()) * 1000, 1),
                  'min(rim_arc-hspan)_mm', round(float((pt_['rim_arc'] - pt_['hspan'])[ok_].min()) * 1000, 1),
                  'per_col', [round(float(r_ - h2_) * 1000) for r_, h2_ in zip(pt_['rim_arc'], pt_['hspan'])], flush=True)
        if upper:
            e = (0 if e < -.0005 else 1 + e * 100) + (0 if g[7][0] <= 0 else 1 + g[7][0] * 100) + abs(g[7][1] - .28) + 4 * g[7][2]
        else:      # the smallest pivot lift that still hides it at -0.10: the squint then rises over the eye, not out of the cheek
            e = (0 if e < -.0002 else 1 + e * 100) + .05 * dz
        if best is None or e < best[0]: best = (e, float(dz), g)
    e, dz, (V, UVs, fs, pivot, cols, target, NRM, closure, paint) = best
    chart = 'lidU' if upper else 'lidD'
    if tag == 'L': LID_PAINT[chart] = paint
    name = ('Moka_lidU_' if upper else 'Moka_lidD_') + tag
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
    return tuple(float(v) for v in pivot)
for tag in 'LR':
    P['lidU_' + tag] = lid_shell(tag, True)
    P['lidD_' + tag] = lid_shell(tag, False)
if os.environ.get('LID_ONLY'): sys.exit(0)

RING_K = float(os.environ.get('RING_K', '1.10'))
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
        # over the opening: exactly her surrounding face fur, interpolated (Shepard, 1/d^3) from the skin's paint on a ring
        # just outside the rim (no lash band, no blush), so the closed lid carries the colour the skin has round it
        psr = np.linspace(0, 2 * math.pi, 96, endpoint=False); rx, rz = ns['eye_xz'](1, psr, RING_K)
        ry = front_hit(rx, rz); rd = np.stack([rx, ry, rz], -1) - ns['O']; rd /= np.linalg.norm(rd, axis=1, keepdims=True)
        ruv = ns['head_uv'](rd); RC = np.asarray(ns['paint_head'](ruv[:, 0], ruv[:, 1])).reshape(-1, 3)
        ns['PAINT_OPTS']['band'] = True; ns['PAINT_OPTS']['blush'] = True
        d2 = (Pp[:, 0, None] - rx[None]) ** 2 + (Pp[:, 2, None] - rz[None]) ** 2; wr = 1 / (d2 + 1e-7) ** 1.5
        CS = ((wr[..., None] * RC[None]).sum(1) / wr.sum(1)[:, None]).reshape(h, w, 3)
        srp = ns['eye_s'](1, Pp[:, 0], Pp[:, 2])[0].reshape(h, w)
        C = mix(CS, C, smooth(1.0, RING_K, srp))
        if chart == 'lidU' and os.environ.get('LID_DIAG'):
            for X_, d_, r_, hs_ in zip(info['X'], info['dark'], info['rim_arc'], info['hspan']): print('LASH', round(float(X_), 2), 'dark', round(d_ * 1000, 1), 'rim_arc', round(r_ * 1000, 1), 'hspan', round(hs_ * 1000, 1), flush=True)
        if chart == 'lidU':
            col = lambda k: info[k][i0] * (1 - a) + info[k][i0 + 1] * a
            dk, ra, hs = col('dark'), col('rim_arc'), col('hspan')
            # the part below her lower rim when closed is never seen in a blink, only in the squint, up beside her painted
            # lash band: paint it with what the skin shows at its squint position (band included), so where it stands
            # proud of the skin at the inner corner it reads as the band, not a flap
            pv = np.array(P['lidU_L']); dq = 1.22 - SQ_U; c_, s_ = math.cos(dq), math.sin(dq)
            dy, dz_ = Pp[:, 1] - pv[1], Pp[:, 2] - pv[2]
            Psq = np.stack([Pp[:, 0], pv[1] + dy * c_ + dz_ * s_, pv[2] + dz_ * c_ - dy * s_], -1)
            dq_ = Psq - ns['O']; dq_ /= np.linalg.norm(dq_, axis=1, keepdims=True); uvq = ns['head_uv'](dq_)
            ns['PAINT_OPTS']['blush'] = False
            Cq = np.asarray(ns['paint_head'](uvq[:, 0], uvq[:, 1])).reshape(h, w, 3)
            ns['PAINT_OPTS']['blush'] = True
            srq, _a, _X, Znq = ns['eye_s'](1, Psq[:, 0], Psq[:, 2])
            hid_b = smooth(-.0004, -.0016, head_sdf(Pp)).reshape(h, w)                          # behind the skin when closed
            wq = hid_b * (smooth(.885, .92, srq) * smooth(0, .2, Znq)).reshape(h, w)
            C = mix(C, Cq, wq)
            # the closed lid meets her lower rim `ra` above its edge; where that is more than ~8 mm (the inner half, which
            # sits further from the hinge and closes deeper) the line would float on the squinting lid as a crease, so the
            # lash stroke runs from the outer corner along the rim and fades there
            alpha = 1 - smooth(.005, .011, ra)
            # the strip is drawn where the closed lid lies just inside her lower outline, seen from the front, so it keeps
            # its width round the steep inner corner
            sr_, _a, _X, Zn_ = ns['eye_s'](1, Pp[:, 0], Pp[:, 2]); sr_ = sr_.reshape(h, w); Zn_ = Zn_.reshape(h, w)
            dks = dk / EHH
            band = smooth(1 - dks - .008, 1 - dks + .004, sr_) * (1 - smooth(1.025, 1.045, sr_)) * (1 - smooth(-.10, .30, Zn_))
            C = mix(C, rgb('lash'), alpha * band)
            C = mix(C, rgb('lash'), .85 * (1 - smooth(.0008, .0016, arc)))         # a thin line along the edge itself (the squint)
        else:
            C = mix(C, rgb('#4a2a1c'), .80 * np.exp(-((arc - .0012) / .0014) ** 2))
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'moka-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()

# ---------------------------------------------------------------- mouth: part the skin along the smile, add the cavity
CUT = .94 * MHW
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Moka_head']; uvl = old.uv_layers.active.data
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
me = bpy.data.meshes.new('Moka_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, u in zip(poly.loop_indices, uu): layer.data[l].uv = u
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < .0003) & np.array([l_ == 'ball_head_skin' for l_ in FL])
FN[onsk] = ns['grad_n'](FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Moka_head'] = vlab
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
    lat = 1 - sm(.14, .27, abs(xl)); back = 1 - sm(.42, .58, b)
    return below * lat * back * (1 - sm(.20, .28, zl))
def face_weights(p, lab, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab != 'ball_head_skin': return {'head': 1}
    q = M2L(np.array(p)); zl = q[2]; b = q[1] - NOSE_TIP_L
    lip = lip_w(x, z) * (1 - sm(-.22, -.12, y - HY))
    jw = jaw_w(x, y, z, kind)
    neck = sm(-.02, -.11, zl) * sm(.40, .55, b)
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
def ear_weights(p, side):
    zl = (p[2] - CHIN) / W
    hd = sm(.40, .53, zl)                         # the root blends into the head under the brim
    tip = sm(-.02, -.14, zl)                       # the lower half (ribbon, bow, tuft) swings on earTip
    return {'head': hd, 'ear_' + side: (1 - hd) * (1 - tip), 'earTip_' + side: (1 - hd) * tip}
def side_of(lab, x):
    if lab.endswith('.L') or lab.endswith('.1') or lab.endswith('.0'): return 'L'
    if lab.endswith('.R') or lab.endswith('.-1'): return 'R'
    return 'L' if x >= 0 else 'R'
def thigh_split(x, th):
    wl = th * float(np.clip(.5 + x / .24, 0, 1)); return wl, th - wl
def torso(z, lo=.48, hi=.58):
    up = sm(lo, hi, z); ch = sm(.56, .64, z); return (1 - up), up * (1 - ch), up * ch
def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab == 'outer_scholar_robe':
        h_, s_, c_ = torso(z)
        th = .36 * (1 - sm(.20, .44, z)); wl, wr = thigh_split(x, th)
        arm = .25 * sm(.15, .19, abs(x)) * sm(.58, .63, z)
        return {'hips': h_ * (1 - th), 'thigh_L': h_ * wl, 'thigh_R': h_ * wr, 'spine': s_, 'chest': c_ * (1 - arm), 'upperarm_' + side: c_ * arm}
    if lab == 'inner_kimono_skirt':
        th = .32 * (1 - sm(.24, .44, z)); wl, wr = thigh_split(x, th)
        return {'hips': 1 - th, 'thigh_L': wl, 'thigh_R': wr}
    if lab == 'inner_kimono_bodice':
        h_, s_, c_ = torso(z); return {'hips': h_, 'spine': s_, 'chest': c_}
    if lab == 'violet_sash': return {'spine': .6, 'hips': .4}
    if lab == 'seafoam_stole':
        c_ = sm(.50, .60, z); return {'chest': .55 + .45 * c_, 'spine': .45 * (1 - c_)}
    if lab.startswith(('tassel_bead', 'tassel_strand')): return {'chest': .65, 'spine': .35}
    if lab in ('leather_satchel', 'satchel_flap', 'gold_star_on_flap'):
        tl = .22 * (1 - sm(.27, .36, z)); return {'hips': 1 - tl, 'thigh_L': tl}
    if lab == 'leather_strap':
        hp = 1 - sm(.42, .56, z); return {'hips': hp, 'chest': 1 - hp}
    if lab.startswith('duck_'): return {'hips': 1}
    if lab.startswith('bell_sleeve'):
        s_ = 1 if side_of(lab, x) == 'L' else -1; t_ = side_of(lab, x)
        chest = .30 * (1 - sm(.13, .19, abs(x)))
        return {'chest': chest, 'upperarm_' + t_: 1 - chest}
    if lab.startswith('fur_arm_mitten'):
        t_ = side_of(lab, x); s_ = 1 if t_ == 'L' else -1
        sh = np.array(ARM[s_]['upperarm']); wr_ = np.array(ARM[s_]['hand'])
        d = wr_ - sh; t = float((np.array(p) - sh) @ d / (d @ d))
        if t >= 1.0: return {'hand_' + t_: 1}                               # the mitten is rigid
        fore = sm(.40, .66, t); hand = sm(.93, 1.0, t); chest = .08 * (1 - sm(-.05, .10, t))
        return {'chest': chest, 'upperarm_' + t_: (1 - chest) * (1 - fore), 'forearm_' + t_: (1 - chest) * fore * (1 - hand), 'hand_' + t_: (1 - chest) * fore * hand}
    if lab.startswith('fur_leg_foot'):
        t_ = side_of(lab, x)
        if z < .085: return {'foot_' + t_: 1}                                # the foot is rigid
        hips = .85 * sm(.33, .40, z); shin = 1 - sm(.20, .27, z); foot = 1 - sm(.085, .12, z)
        return {'hips': hips, 'thigh_' + t_: (1 - hips) * (1 - shin), 'shin_' + t_: (1 - hips) * shin * (1 - foot), 'foot_' + t_: (1 - hips) * shin * foot}
    if lab.startswith('tail_curl_'): return {'tail%d' % (int(lab[-1]) + 1): 1}
    return {'spine': 1}

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
assert len(HERO) == 37 and set(HERO) == set(P)
adata = bpy.data.armatures.new('Moka_game_skeleton'); arm = bpy.data.objects.new('Moka_Rig', adata); bpy.context.collection.objects.link(arm)
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
mouth = make_mesh('Moka_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
cc = Vector((0, rim[len(rim) // 2][1] + .03, MZ))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .038
tongue_c = np.array([0, ty, MZ - .020 * W])
ns['parts']['head'] = []
tongue = ns['lobe']('Moka_tongue', tongue_c, np.array([.012, .045, .060]) * W, [0, 0, 1.], 'head', ramp='dark', n=3, occ_in=0, pole=[1., 0, 0])
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
    if o.name == 'Moka_head': weights = [face_weights(p, l, k) for p, l, k in zip(pp, lab, vkind)]
    elif o.name == 'Moka_hat': weights = [{'head': 1} for p in pp]
    elif o.name.startswith('Moka_eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    elif o.name.startswith('Moka_ear_'): weights = [ear_weights(p, o.name[-1]) for p in pp]
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
print('TRI_TOTAL', total, flush=True); assert total <= 38000, total
hidden = {}
for o, bname in lid_objects:
    piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
    for ang in ([0.0] if bname.startswith('lidU') else [0.0, -.10]):
        c, s_ = math.cos(ang), math.sin(ang); d = V - piv
        Vr = np.stack([d[:, 0], d[:, 1] * c - d[:, 2] * s_, d[:, 1] * s_ + d[:, 2] * c], -1) + piv
        sd = head_sdf(Vr); hidden[f'{o.name}@{ang}'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
sd = head_sdf(np.array([list(v.co) for v in tongue.data.vertices]))
hidden['Moka_tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
print('HIDDEN', json.dumps(hidden), flush=True)
# the staff grip (right fist) and the left palm, in game axes (X = +X, Y = up, Z = -Blender Y)
def g3(v): v = np.asarray(v, float); return [round(float(v[0]), 5), round(float(v[2]), 5), round(float(-v[1]), 5)]
grip = {}
for t, s_ in (('R', -1), ('L', 1)):
    palm = np.array(JB['palm_' + t]); axis = np.array([0, 0, 1.])            # the shaft stands upright through the fist (staff +Y up)
    grip['hand_' + t] = {'hand_head_game': g3(P['hand_' + t]), 'palm_centre_game': g3(palm), 'grip_axis_game': g3(axis),
                         'palm_offset_from_hand_game': g3(palm - np.array(P['hand_' + t]))}
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'moka-toy_rig.blend'))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]], 'head_game_m': g3(P[b])} for b in HERO],
       'triangles': total, **{k: ns['LOG'][k] for k in ('head_refine_before', 'head_refine') if k in ns['LOG']}, 'lids': lid_info, 'lids_hidden_check': hidden, 'staff_grip': grip, 'mouth_seam_points': len(rim),
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids are surfaces of revolution about their bone X axis: a rotation slides them along themselves.',
                 'Weights quantized to an exact 255 sum; <= 4 influences. Hat, topknot, nape curls rigid to head; ears ear->earTip.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2))
print('MOKA_RIG', json.dumps({'bones': len(HERO), 'triangles': total, 'grip': grip}), flush=True)
