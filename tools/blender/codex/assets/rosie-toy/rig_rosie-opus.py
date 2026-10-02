"""Rosie (rosie-opus) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, world-axis game contract.

    blender --background --factory-startup --python rig_rosie-opus.py

Runs build_rosie-opus.py in RIG_MODE (part labels, the two phase-2 fixes, rig atlas charts; the approved GLB and round-3
files are not touched), then adds:
  - the armature (exactly the hero contract, identity rest orientations, heads at the joints);
  - the mouth: the skin parted along the painted smile between sealed corners, a closed cavity and a tongue;
  - eyelids: rigid shells that are surfaces of revolution about their bone's X axis (one radius per x-slice, just
    outside the eyeball and the lash band), so a rotation slides the lid along itself and can never cut the eye;
  - weights (spatial fields + part labels, <= 4 influences, quantized to an exact 255 sum);
and saves rosie-opus_rig.blend with only Armature modifiers left.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'build_rosie-opus.py').read_text(encoding='utf-8')
ns = {'__file__': str(ROOT / 'build_rosie-opus.py'), '__name__': 'rosie_model', 'RIG_MODE': True}
exec(compile(src, str(ROOT / 'build_rosie-opus.py'), 'exec'), ns)
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

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
J = {'hips': (0, .015, .353), 'spine': (0, .015, .469), 'chest': (0, .014, .600)}
ARM = {s: {'upperarm': (s * .235, .014, .632), 'forearm': (s * .292, -.010, .533), 'hand': (s * .336, -.023, .459)} for s in (-1, 1)}
LEG = {s: {'thigh': (s * .104, .015, .305), 'shin': (s * .107, .010, .254), 'foot': (s * .108, .007, .125)} for s in (-1, 1)}
nose_tip_y = HY + NOSE_TIP_L * W
neck_c = ns['L2M'](np.array(ns['NECK'][0]))
mouth_y = float(front_hit(0., MZ)[0]); corner_z = MZ + .016 * W
P = {'root': (0, -.010, 0), **J,
     'neck': (0, float(neck_c[1]), .700),
     'head': (0, float(neck_c[1]) + .045, .725),                          # skull base: the nod pivot at the back of the neck
     'jaw': (0, mouth_y + .22 * W, corner_z)}                              # the hinge line inside the head, 0.22 W behind the smile
for s, tag in ((1, 'L'), (-1, 'R')):
    e = ns['eye_centers'][tag]
    P['eye_' + tag] = tuple(e)
    P['brow_' + tag] = (s * ns['BROW_X'], float(front_hit(s * ns['BROW_X'], ns['BROW_Z'])[0]) + .012, ns['BROW_Z'])
    cy = float(front_hit(s * MHW, corner_z)[0])
    P['lip_' + tag] = (s * MHW, cy + .002, corner_z)
    C0, ne, up, tt = ns['ear_info'][s]
    P['ear_' + tag] = tuple(C0 - ne * .02); P['earTip_' + tag] = tuple(C0 + ne * .015 + np.array([s * .01, 0, 0]))
    for k, v in ARM[s].items(): P[k + '_' + tag] = v
    for k, v in LEG[s].items(): P[k + '_' + tag] = v
for i in range(4): P['tail%d' % (i + 1)] = (0, .08 + .02 * i, .42 - .01 * i)

# ---------------------------------------------------------------- cull geometry no view can ever see (budget for the face)
# The hair, the bow, the head skin and the eyes all move rigidly with the head, so a hair or eye triangle that every outward
# ray from its corners runs into another head-rigid surface is invisible from every camera, in every pose: it is deleted.
# (Buried halves of the curls and pillows, the backs of the eyeballs.) The visible look is unchanged.
def fib_dirs(n):
    i = np.arange(n) + .5; ph = np.arccos(1 - 2 * i / n); th = math.pi * (1 + 5 ** .5) * i
    return np.stack([np.sin(ph) * np.cos(th), np.sin(ph) * np.sin(th), np.cos(ph)], -1)
DIRS = fib_dirs(200)
def cull_hidden(targets, occluders):
    allv = []; allt = []
    for o in occluders:
        me = o.data; me.calc_loop_triangles(); b = len(allv)
        allv += [v.co.copy() for v in me.vertices]; allt += [tuple(i + b for i in t.vertices) for t in me.loop_triangles]
    tree = BVHTree.FromPolygons(allv, allt)
    out = {}
    for o in targets:
        me = o.data
        vn = np.zeros((len(me.vertices), 3))
        for l_, c_ in zip(me.loops, me.corner_normals): vn[l_.vertex_index] += c_.vector
        vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-9)
        hidden_v = np.zeros(len(me.vertices), bool)
        for vi, v in enumerate(me.vertices):
            ok = DIRS[DIRS @ vn[vi] > .05]; blocked = True
            for d in ok:
                dv = Vector(d); h = tree.ray_cast(v.co + dv * .0008, dv, .6)
                if h[0] is None: blocked = False; break
            hidden_v[vi] = blocked
        bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        dead_m = np.array([all(hidden_v[v.index] for v in f.verts) for f in bm.faces])
        for _ in range(2):          # keep a two-ring margin around everything visible (crevices between the lobes)
            live_v = np.zeros(len(bm.verts), bool)
            for f, d_ in zip(bm.faces, dead_m):
                if not d_:
                    for v in f.verts: live_v[v.index] = True
            dead_m = np.array([d_ and not any(live_v[v.index] for v in f.verts) for f, d_ in zip(bm.faces, dead_m)])
        dead = [f for f, d_ in zip(bm.faces, dead_m) if d_]
        n0 = len(bm.faces); bmesh.ops.delete(bm, geom=dead, context='FACES')
        lost = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=lost, context='VERTS')
        keep_idx = None
        bm.verts.ensure_lookup_table()
        # carry the part labels and custom normals through the deletion
        lay = bm.verts.layers.int.get('orig_idx')
        bm.to_mesh(me); bm.free()
        out[o.name] = (n0, len(me.polygons))
    return out
for o in base_objects:      # tag every vertex with its index so the part labels can follow the cull
    a_ = o.data.attributes.new('orig_idx', 'INT', 'POINT'); a_.data.foreach_set('value', np.arange(len(o.data.vertices), dtype=np.int32))
    lnor = np.empty(len(o.data.loops) * 3, np.float32); o.data.corner_normals.foreach_get('vector', lnor)
    c_ = o.data.attributes.new('cust_lnor', 'FLOAT_VECTOR', 'CORNER'); c_.data.foreach_set('vector', lnor)
head_rigid = [OBJ[n] for n in ('Rosie_head', 'Rosie_hair', 'Rosie_eye_L', 'Rosie_eye_R')]
CULL = cull_hidden([OBJ['Rosie_hair'], OBJ['Rosie_eye_L'], OBJ['Rosie_eye_R']], head_rigid)
for n in ('Rosie_hair', 'Rosie_eye_L', 'Rosie_eye_R'):
    me = OBJ[n].data; oi = np.empty(len(me.vertices), np.int32); me.attributes['orig_idx'].data.foreach_get('value', oi)
    labels[n] = [labels[n][i] for i in oi]
    ln = np.empty(len(me.loops) * 3, np.float32); me.attributes['cust_lnor'].data.foreach_get('vector', ln)
    me.normals_split_custom_set([tuple(v) for v in ln.reshape(-1, 3)])
for o in base_objects:
    for k in ('orig_idx', 'cust_lnor'):
        if o.data.attributes.get(k) is not None: o.data.attributes.remove(o.data.attributes[k])
print('CULL', json.dumps({k: {'faces_before': a_, 'faces_after': b_} for k, (a_, b_) in CULL.items()}), flush=True)

# ---------------------------------------------------------------- BVHs of the approved skin and eyes
head = OBJ['Rosie_head']; head.data.calc_loop_triangles()
skin_vids = [i for i, l in enumerate(labels['Rosie_head']) if l == 'ball_head_skin']
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Rosie_eye_' + t].data.vertices],
                                    [tuple(p.vertices) for p in OBJ['Rosie_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
def front_y(x, z, tag):
    a = ray_y(eye_tree[tag], x, z); b = ray_y(skin_tree, x, z)
    c = [v for v in (a, b) if v is not None]; return min(c) if c else None

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
        h = eye_tree[tag].ray_cast(o + d * .34, -d, .34)
        out.append(.34 - h[3] if h[0] is not None else 0.)
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
    Xs = np.linspace(-1.14, 1.0, 21) if upper else np.linspace(-.88, .88, 19)
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
def lid_shell(tag, upper):
    angs = [0.0] if upper else [0.0, -.10]
    cands = np.linspace(-.04, .32, 10) if upper else np.linspace(0, .32, 17)
    best = None
    for dz in cands:
        g = lid_geometry(tag, upper, float(dz)); e = rest_exposure(g[0], g[3], angs)
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
    chart = 'lidU' if upper else 'lidD'
    if tag == 'L': LID_PAINT[chart] = paint
    name = ('Rosie_lidU_' if upper else 'Rosie_lidD_') + tag
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], fs); me.update()
    layer = me.uv_layers.new(name='Atlas')
    for p in me.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer.data[l].uv = au(chart, *UVs[me.loops[l].vertex_index])
    bm = bmesh.new(); bm.from_mesh(me); yp, zp = pivot[1], pivot[2]
    for f in bm.faces:        # outward = away from the pivot axis
        c = f.calc_center_median()
        if f.normal.dot(Vector((0, c.y - yp, c.z - zp))) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
    me.normals_split_custom_set([tuple(NRM[me.loops[l].vertex_index]) for l in range(len(me.loops))])
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT)
    lid_objects.append((ob, ('lidU_' if upper else 'lidD_') + tag))
    lid_info[name] = {'pivot': [float(v) for v in pivot], 'pivot_offset_m': dz, 'score': round(e, 4),
                      'closed_edge_above_rim_mm': None if closure is None else round(closure[0] * 1000, 2),
                      'squint_coverage': None if closure is None else round(closure[1], 3),
                      'closed_standoff_centre_mm': None if closure is None else round(closure[2] * 1000, 2),
                      'radius_centre_m': float(cols[len(cols) // 2][1]), 'target': target}
    return tuple(float(v) for v in pivot)
for tag in 'LR':
    P['lidU_' + tag] = lid_shell(tag, True)
    P['lidD_' + tag] = lid_shell(tag, False)

# the lid charts: her own face paint (without the upper lash band) under each lid point at its target pose, so a
# closed or squinting lid is the skin it covers; the upper lid carries the thick lash line on its edge, the lower a
# soft crease line
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
        Pp = bil(G).reshape(-1, 3); arc = bil(A); Xc = info['X'][i0] * (1 - a) + info['X'][i0 + 1] * a
        d = Pp - ns['O']; d /= np.linalg.norm(d, axis=1, keepdims=True)
        uv = ns['head_uv'](d)
        ns['PAINT_OPTS']['band'] = False; ns['PAINT_OPTS']['blush'] = False
        C = np.asarray(ns['paint_head'](uv[:, 0], uv[:, 1])).reshape(h, w, 3)
        ns['PAINT_OPTS']['band'] = True; ns['PAINT_OPTS']['blush'] = True
        # her skin as it renders around the socket: the lids carry the eye's (more lit) orientation, so their albedo is
        # set a touch deeper to read as the same skin under the same light
        if chart == 'lidU':
            dk = info['dark'][i0] * (1 - a) + info['dark'][i0 + 1] * a
            C = mix(C, rgb('lash'), 1 - smooth(dk - .0006, dk + .0006, arc))
        else:
            C = mix(C, rgb('#7a3e32'), .85 * np.exp(-((arc - .0006) / .0011) ** 2))     # a soft crease along the raised edge
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'rosie-opus_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()

# ---------------------------------------------------------------- mouth: part the skin along the smile, add the cavity
def smile_z(x):
    t = min(abs(x) / MHW, 1.0); return MZ + .020 * W * t ** 2.2 - .004 * W
CUT = .94 * MHW
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Rosie_head']; uvl = old.uv_layers.active.data
verts = []; vlab = []; vkind = []; faces = []; fuv = []; fno = []; cache = {}; seam = []
def addv(rec, kind):
    co, uv, no, lab = rec
    if kind is None: kind = 'lower' if (lab == 'ball_head_skin' and co.z < smile_z(co.x)) else 'upper'
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
    if cut: emit(clip(rr, True), 'upper'); emit(clip(rr, False), 'lower')     # the seam: coincident upper / lower rims
    else: emit(rr, None)
me = bpy.data.meshes.new('Rosie_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, u in zip(poly.loop_indices, uu): layer.data[l].uv = u
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < .0003) & np.array([l_ == 'ball_head_skin' for l_ in FL])
FN[onsk] = ns['grad_n'](FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Rosie_head'] = vlab
seam = sorted(set(tuple(round(c, 7) for c in p) for p in seam), key=lambda p: p[0])
rim = []
for p in seam:
    if not rim or p[0] - rim[-1][0] > .0016: rim.append(p)
assert len(rim) >= 10, len(rim)
LOG = {'mouth_seam_points': len(rim), **{k: ns['LOG'][k] for k in ('head_refine_before', 'head_refine') if k in ns['LOG']}}

# ---------------------------------------------------------------- weights
def lip_w(x, z):
    return .85 * math.exp(-((abs(x) - MHW) / (.034 * W)) ** 2 - ((z - corner_z) / (.034 * W)) ** 2)
def jaw_w(x, y, z, kind):
    q = M2L(np.array([x, y, z])); xl, yl, zl = q; b = yl - NOSE_TIP_L
    sharp = 1.0 if kind == 'lower' else 0.0
    field = 1 - sm(-.006 * W, .010 * W, z - smile_z(x))           # the whole skin around the sealed corners
    we = sm(.74 * CUT, CUT, abs(x)); below = sharp * (1 - we) + field * we
    lat = 1 - sm(.10, .23, abs(xl)); back = 1 - sm(.36, .46, b)
    return below * lat * back
def face_weights(p, lab, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab.startswith('small_round_ear'): return {'head': 1}
    q = M2L(np.array(p)); zl = q[2]; b = q[1] - NOSE_TIP_L
    lip = lip_w(x, z) * (1 - sm(-.22, -.12, y - HY))
    jw = jaw_w(x, y, z, kind)
    neck = sm(-.02, -.11, zl) * sm(.30, .42, b)
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}

def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab.endswith('.L') or lab.endswith('.1'): side = 'L'
    if lab.endswith('.R') or lab.endswith('.-1'): side = 'R'
    if lab in ('rounded_pink_bodice',):
        hips = 1 - sm(.505, .545, z); chest = sm(.535, .615, z)
        arm = .30 * sm(.150, .190, abs(x)) * sm(.600, .640, z)
        return {'hips': hips, 'spine': (1 - hips) * (1 - chest), 'chest': (1 - hips) * chest * (1 - arm), 'upperarm_' + side: (1 - hips) * chest * arm}
    if lab.startswith(('flat_peter_pan_flap', 'thin_flat_collar_back_band')):
        rides = sm(.670, .700, z) * sm(-.03, -.07, y) * (1 - sm(.06, .11, abs(x)))
        return {'chest': 1 - rides, 'neck': .45 * rides, 'head': .55 * rides}
    if lab.startswith(('strawberry_brooch', 'brooch_leaf')): return {'chest': 1}
    if lab.startswith(('a_line_skirt', 'continuous_white_scalloped_hem')):
        th = .36 * (1 - sm(.33, .47, z))
        wl = th * float(np.clip(.5 + x / .20, 0, 1)); wr = th - wl
        return {'hips': 1 - th, 'thigh_L': wl, 'thigh_R': wr}
    if lab.startswith(('puffy_sleeve', 'gathered_sleeve_cuff', 'short_chubby_arm')):
        sh = np.array(ARM[1 if side == 'L' else -1]['upperarm']); el = np.array(ARM[1 if side == 'L' else -1]['forearm'])
        wr_ = np.array(ARM[1 if side == 'L' else -1]['hand'])
        if lab.startswith('puffy_sleeve'):
            chest = .15 * (1 - sm(.190, .240, abs(x)))
            return {'chest': chest, 'upperarm_' + side: 1 - chest}
        d = wr_ - sh; t = float((np.array(p) - sh) @ d / (d @ d))
        if z < .452: return {'hand_' + side: 1}                          # the mitten is rigid
        fore = sm(.36, .62, t); hand = sm(.93, 1.0, t); chest = .08 * (1 - sm(-.05, .10, t))
        return {'chest': chest, 'upperarm_' + side: (1 - chest) * (1 - fore), 'forearm_' + side: (1 - chest) * fore * (1 - hand), 'hand_' + side: (1 - chest) * fore * hand}
    if lab.startswith(('rounded_mary_jane', 'darker_rounded_sole', 'warm_white_instep', 'mary_jane_instep_strap', 'strap_button')):
        return {'foot_' + side: 1}
    if lab.startswith(('visible_chubby_leg', 'white_sock', 'folded_sock_cuff')):
        hips = .85 * sm(.300, .345, z); shin = 1 - sm(.225, .285, z); foot = 1 - sm(.118, .150, z)
        return {'hips': hips, 'thigh_' + side: (1 - hips) * (1 - shin), 'shin_' + side: (1 - hips) * shin * (1 - foot), 'foot_' + side: (1 - hips) * shin * foot}
    return {'chest': 1}

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
adata = bpy.data.armatures.new('Rosie_game_skeleton'); arm = bpy.data.objects.new('Rosie_Rig', adata); bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in HERO:
    b = adata.edit_bones.new(name); b.head = P[name]; b.tail = Vector(P[name]) + Vector((0, .04, 0)); b.roll = 0
    if PARENT[name]: b.parent = adata.edit_bones[PARENT[name]]
    b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for b in arm.pose.bones: b.rotation_mode = 'YZX'          # = three.js 'XYZ' order under the game axis mapping
arm.show_in_front = True

# ---------------------------------------------------------------- the mouth cavity and tongue (after the bones: weights use jaw/lip)
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
            ww = face_weights((x, y, z), 'ball_head_skin', level)
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
mouth = make_mesh('Rosie_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
cc = Vector((0, rim[len(rim) // 2][1] + .03, MZ))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()        # faces look into the pocket
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .030              # far enough back that it never shows through the closed lip
tongue_c = (0, ty, MZ - .018 * W)
ns['parts']['head'] = []
tongue = ns['sphere']('Rosie_tongue', tongue_c, (.060 * W, .045 * W, .012 * W), 'tongue', 'head', 12, 6)
for l in tongue.data.uv_layers.active.data: l.uv = au('tongue', .5, .5)
tongue.data.materials.clear(); tongue.data.materials.append(MAT)

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
    if o.name == 'Rosie_head':
        kinds = vkind; weights = [face_weights(p, l, k) for p, l, k in zip(pp, lab, kinds)]
    elif o.name == 'Rosie_hair': weights = [{'head': 1} for p in pp]
    elif o.name.startswith('Rosie_eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
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
# hidden at rest: every lid vertex inside the head field (behind the skin or the eye), lower lids also at -0.10
hidden = {}
for o, bname in lid_objects:
    piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
    for ang in ([0.0] if bname.startswith('lidU') else [0.0, -.10]):
        c, s_ = math.cos(ang), math.sin(ang); d = V - piv
        Vr = np.stack([d[:, 0], d[:, 1] * c - d[:, 2] * s_, d[:, 1] * s_ + d[:, 2] * c], -1) + piv
        sd = head_sdf(Vr); hidden[f'{o.name}@{ang}'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
sd = head_sdf(np.array([list(v.co) for v in tongue.data.vertices]))
hidden['Rosie_tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
assert hidden['Rosie_tongue@rest']['outside_count'] == 0, hidden['Rosie_tongue@rest']
# the normals the exporter reads (corner normals) vs the analytic skin normal, and what the toon light sees across each
# triangle (the interpolated normal vs the analytic one under it), over the visible face
def normal_audit():
    me = head.data; me.calc_loop_triangles()
    V = np.array([v.co[:] for v in me.vertices]); lv = np.empty(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    CN = np.empty(len(me.loops) * 3); me.corner_normals.foreach_get('vector', CN); CN = CN.reshape(-1, 3)
    lab = np.array([labels['Rosie_head'][i] == 'ball_head_skin' for i in lv]); Pc = V[lv]
    on = lab & (np.abs(head_sdf(Pc)) < .0003)
    vis = on & (Pc[:, 1] < HY + .01) & (ns['hairline_mask'](M2L(Pc)) > .15) & (Pc[:, 2] > CHIN - .14 * W)
    ang_c = np.degrees(np.arccos(np.clip((ns['grad_n'](Pc[vis]) * CN[vis]).sum(1), -1, 1)))
    TL = np.array([t.loops[:] for t in me.loop_triangles]); Pt = V[lv[TL]]
    ok = vis[TL].all(1); Pt = Pt[ok]; Nt = CN[TL[ok]]
    BARY = np.array([[1 / 3, 1 / 3, 1 / 3], [.6, .2, .2], [.2, .6, .2], [.2, .2, .6], [.5, .5, 0], [.5, 0, .5], [0, .5, .5]])
    q = np.einsum('kj,tjc->tkc', BARY, Pt); nq = np.einsum('kj,tjc->tkc', BARY, Nt); nq /= np.linalg.norm(nq, axis=2, keepdims=True)
    d = (q - ns['O']).reshape(-1, 3); d /= np.linalg.norm(d, axis=1, keepdims=True)
    a = ns['grad_n'](ns['radial_hit_outer'](d)).reshape(q.shape)
    ang_i = np.degrees(np.arccos(np.clip((a * nq).sum(2), -1, 1))).ravel()
    st = lambda x: {'mean': round(float(x.mean()), 3), 'p95': round(float(np.percentile(x, 95)), 3), 'p99': round(float(np.percentile(x, 99)), 3), 'max': round(float(x.max()), 3)}
    return {'corner_normals_vs_analytic_deg': {'n': int(len(ang_c)), **st(ang_c), 'over_2deg': int((ang_c > 2).sum())},
            'interpolated_vs_analytic_deg': {'tris': int(ok.sum()), **st(ang_i), 'frac_over_1deg': round(float((ang_i > 1).mean()), 4)}}
NORMALS = normal_audit(); print('NORMAL_AUDIT', json.dumps(NORMALS), flush=True)
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'rosie-opus_rig.blend'))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]]} for b in HERO],
       'triangles': total, 'lids': lid_info, 'lids_hidden_check': hidden, 'normals': NORMALS, **LOG,
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids are surfaces of revolution about their bone X axis: a rotation slides them along themselves.',
                 'Weights quantized to an exact 255 sum; <= 4 influences; hair, bow, ears rigid to head.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2))
print('ROSIE_RIG', json.dumps({'bones': len(HERO), 'triangles': total, 'hidden': hidden}), flush=True)
