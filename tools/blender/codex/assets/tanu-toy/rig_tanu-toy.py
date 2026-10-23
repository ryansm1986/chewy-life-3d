"""Tanu (tanu-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, world-axis game contract.

    blender --background --factory-startup --python rig_tanu-toy.py

Runs build_tanu-toy.py in RIG_MODE (part labels; lid / cavity / tongue charts in unused atlas space; the approved GLB, blend
and json files are not touched), then adds (after Rosie's rig, tools/blender/codex/assets/rosie-toy):
  - the armature (exactly the hero contract, identity rest orientations, heads at the joints);
  - eyelids: rigid shells that are surfaces of revolution about their bone's X axis (Rosie's round-8 upper lid: one radius per
    column at the top of the lash band, the dark lash stripe on its edge; the lower lid a short arched shell);
  - the mouth: the skin parted along the painted "w" smile between sealed corners, a closed cavity and a tongue; the
    muzzle's lower half, the chin and the under-jaw ride `jaw`, the corners `lip_*`;
  - weights (spatial fields + part labels, <= 4 influences, quantized to an exact 255 sum);
and saves tanu-toy_rig.blend (only Armature modifiers left) and joints-rig.json. Tanu: the leaf rigid to `head`, the round ears
spring (ear_ -> earTip_), the striped tail wags along tail1-4 from the root to the end dome, the satchel hangs from `hips` at
the hip, its strap following spine / chest, the pouch is rigid to `hips` at its tie; the shut lid reads inside the
dark mask by a solid lash ribbon with a lighter crease line above it (as Pan's).
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'build_tanu-toy.py').read_text(encoding='utf-8')
ns = {'__file__': str(ROOT / 'build_tanu-toy.py'), '__name__': 'tanu_model', 'RIG_MODE': True}
exec(compile(src, str(ROOT / 'build_tanu-toy.py'), 'exec'), ns)
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MZM = ns['MZM']; MHW = .0835 * W
smooth, au, MAT, M2L = ns['smooth'], ns['au'], ns['MAT'], ns['M2L']
head_sdf, front_hit = ns['head_sdf'], ns['front_hit']
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
JA, JL = ns['joint_arms'], ns['joint_legs']
mouth_y = float(front_hit(0., MZM)[0])
CORNER_X = .080 * W; corner_z = MZM + .011 * W                 # the sealed mouth corners (the w's upturned ticks)
MUZ_FRONT_L = (mouth_y - HY) / W                                # the muzzle front at the mouth (W, head-local y)
TAIL_PTS = ns['TAIL_PTS']; catmull = ns['catmull']
TAIL_T = (.12, .38, .62, .86)                                    # tail1 just inside the rump, tail4 at the end dome's base
P = {'root': (0, -.010, 0), 'hips': (0, .005, .205), 'spine': (0, .000, .320), 'chest': (0, .005, .430), 'neck': (0, .015, .505),
     'head': (0, .060, CHIN + .002),                                  # the skull base: the nod pivot at the back of the neck, chin height
     'jaw': (0, mouth_y + .22 * W, corner_z)}                         # the hinge inside the head, 0.22 W behind the mouth
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * ns['BROW_X'], float(front_hit(s * ns['BROW_X'], ns['BROW_Z'])[0]) + .012, ns['BROW_Z'])
    P['lip_' + tag] = (s * CORNER_X, float(front_hit(s * CORNER_X, corner_z)[0]) + .002, corner_z)
    C0, ne, up, tt = ns['ear_info'][s]; R_E = .160 * W
    P['ear_' + tag] = tuple(float(c) for c in C0 - up * .55 * R_E - ne * .020)          # the ear's base, where it grows from the head
    P['earTip_' + tag] = tuple(float(c) for c in C0 + up * .25 * R_E + np.array([s * .012, 0, 0]))   # a little up and out along the ear
    P['upperarm_' + tag] = tuple(JA[tag]['shoulder']); P['forearm_' + tag] = tuple(JA[tag]['elbow']); P['hand_' + tag] = tuple(JA[tag]['wrist'])
    P['thigh_' + tag] = tuple(JL[tag]['hip']); P['shin_' + tag] = tuple(JL[tag]['knee']); P['foot_' + tag] = tuple(JL[tag]['ankle'])
for i, t in enumerate(TAIL_T):                                       # along the tail's centreline, root to the end dome
    P['tail%d' % (i + 1)] = tuple(float(c) for c in catmull(TAIL_PTS, t))

# ---------------------------------------------------------------- BVHs of the approved skin and eyes
head = OBJ['Tanu_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Tanu_eye_' + t].data.vertices],
                                    [tuple(p.vertices) for p in OBJ['Tanu_eye_' + t].data.polygons]) for t in 'LR'}
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
def skin_dist(x, pivot, phs, tmax=.34):
    """distance from the pivot to the outermost skin crossing along the rays (0, -cos ph, sin ph) in the plane x"""
    phs = np.asarray(phs, float); n = len(phs)
    d = np.stack([np.zeros(n), -np.cos(phs), np.sin(phs)], -1); o = np.array([x, pivot[1], pivot[2]])
    ts = np.linspace(tmax, .02, int(161 * tmax / .34))
    Pp = o + ts[None, :, None] * d[:, None, :]
    ins = (head_sdf(Pp.reshape(-1, 3)) < 0).reshape(n, len(ts)); i = np.argmax(ins, 1)
    lo = ts[i]; hi = ts[np.maximum(i - 1, 0)]
    for _ in range(10):
        m = (lo + hi) / 2; inn = head_sdf(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return np.where(ins.any(1), (lo + hi) / 2, tmax)
def eye_dist(x, pivot, phs, tag, tmax=.34):
    """distance from the pivot axis to the outermost eye surface along the rays (0, -cos ph, sin ph) in the plane x"""
    out = []
    for ph in phs:
        d = Vector((0, -math.cos(ph), math.sin(ph))); o = Vector((x, pivot[1], pivot[2]))
        h = eye_tree[tag].ray_cast(o + d * tmax, -d, tmax)
        out.append(tmax - h[3] if h[0] is not None else 0.)
    return np.array(out)
ROWS_U = [0, .03, .06, .09, .12, .155, .20, .26, .33, .42, .53, .66, .82, 1.0]
ROWS_D = [0, .04, .10, .18, .26, .34, .42, .50, .58, .66, .74, .82, .91, 1.0]   # Kuma: denser (the rim cover)
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
        a_lev = .37 * H / abs(LD_T + .10); zp = (EZ - .40 * EHH) + dz; yp = ye + a_lev
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
    target = 1.22 if upper else LD_T
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
            r0 = r0 - .006 * float(smooth(.50, .88, abs(X)))          # Kuma: the ends tuck under the rim (no sheet at the outer corner)
            if LD_COVER:
                # Kuma (rig round 2): one radius per column over the opening -- just in front of the eye and never in front of the
                # head ball (no flap at the corners); at its target the lid then ramps out onto the skin over the painted lower rim
                # line (covering it: no "spectacle" ring) and dives into the cheek below the line
                sk = skin_dist(x, pivot, phs, .70); ed = eye_dist(x, pivot, phs, tag, .70); cw = 1 - float(smooth(.70, .92, abs(X)))
                over = [k for k, ph in enumerate(phs) if ph >= phR + .004]
                if over:
                    r_cap = min(sk[k] for k in over) - .0005; eo = [ed[k] for k in over if ed[k] > 0]
                    r_eye = (max(eo) + .0015) if eo else 0.
                    r0 = min(r0, max(r_cap, r_eye))
                rr = []
                for ph, skn in zip(phs, sk):
                    on = cw * float(smooth(phR + LD_RAMP, phR + .002, ph))
                    dive = float(smooth(phR - LD_BAND, phR - LD_BAND - LD_DIVE, ph))
                    r_top = (1 - on) * r0 + on * max(r0, skn + .0012)   # 1.2 mm off the skin (no depth stipple in the game)
                    r_dn = min(r0, skn) - .0060
                    rr.append((1 - dive) * r_top + dive * r_dn)
            else:
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
# ---------------------------------------------------------------- round 8: the upper lid for the convex face (LID8, default on)
# The old shell came out of the skin at the top rim, under the painted lash band, which stays put: mid-blink the eye read as an
# empty skin oval inside a dark outline, its edge tore where the shell grazed the skin, and shut its edge sank ~3 cm under
# the cheek (no lash curve). Now each column is one radius r_body = the skin's distance from the hinge at the TOP of the
# lash band (+0.3 mm), so the skin-coloured lid always emerges along the band top (the skin's distance grows above it) and
# covers the band from the first frame: one lash line travels down. Only its dark lash stripe (the edge, painted on the
# lid) dives to r_edge, just outside the eye, to tuck under the lower rim when shut; dark on the dark band, that dive can't
# show. The hinge sits on the eye's height, far enough back (0.21 m) that the lid stands ~2-5 mm off the eye.
LID8 = os.environ.get('LID8', '1') == '1'
LD_T = float(os.environ.get('LD_T', '-.30')); LDH_GAP = float(os.environ.get('LDH_GAP', '.0015')); LDH_COV = float(os.environ.get('LDH_COV', '.30')); LDH_ARCH = float(os.environ.get('LDH_ARCH', '.14')); LDH_OFF = float(os.environ.get('LDH_OFF', '.0020'))     # the lower lid's design angle (HERO_MODELS squint[1])
LD_COVER = os.environ.get('LD_COVER', '1') == '1'; LD_RAMP = float(os.environ.get('LD_RAMP', '.020')); LD_BAND = float(os.environ.get('LD_BAND', '.028')); LD_DIVE = float(os.environ.get('LD_DIVE', '.005'))
L8 = dict(YB=float(os.environ.get('L8_YB', '.21')), ZO=float(os.environ.get('L8_ZO', '-.018')),      # Kuma: the hinge 18 mm low (the flat face)
          SQ=float(os.environ.get('L8_SQ', '.26')), COV=float(os.environ.get('L8_COV', '.15')),
          DELTA=float(os.environ.get('L8_DELTA', '.0003')), G_BODY=.0008, G_EDGE=.0006, TUCK=.0005, NCOL=21)
ROWS8 = [0, .025, .05, .075, .10, .125, .15] + [float(v) for v in np.linspace(.15, 1, 13)[1:]]
LASH_K = float(os.environ.get('LASH_K', '.85')); L8_RISE = float(os.environ.get('L8_RISE', '.16')); L8_HUG = os.environ.get('L8_HUG', '1') == '1'; L8_GH = float(os.environ.get('L8_GH', '.0007')); L8_DKX = float(os.environ.get('L8_DKX', '.003')); L8_DB = float(os.environ.get('L8_DB', '.0015')); L8_RIB = float(os.environ.get('L8_RIB', '.026')); LOG_HUG = {}; L8_ARCH = float(os.environ.get('L8_ARCH', '0'))
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
    if L8_HUG:
        # Kuma (rig round 2): the hinge sits at the eye's own centre of curvature (in the column through the eye centre), so the
        # lid keeps one distance from the eyeball all the way down: it hugs the eye at the squint (Mochi: <= 3 mm) and shut
        zs_ = np.linspace(EZ - .85 * EHH, EZ + .85 * EHH, 15); best_ = None
        for zo in np.arange(-.080, .006, .002):
            pv = np.array([cx, yp, EZ + zo]); dd = []
            for z_ in zs_:
                y_ = ray_y(eye_tree[tag], cx, z_)
                if y_ is not None: dd.append(math.hypot(pv[1] - y_, z_ - pv[2]))
            sp = max(dd) - min(dd)
            if best_ is None or sp < best_[0]: best_ = (sp, zo)
        zp = EZ + best_[1]; pivot = np.array([cx, yp, zp]); LOG_HUG[tag] = {'zo': round(float(best_[1]), 4), 'eye_dist_spread_mm': round(best_[0] * 1000, 2)}
    def angp(y, z): return math.atan2(z - zp, yp - y)
    Xs = np.unique(np.r_[np.linspace(-1.14, 1.0, L8['NCOL']), [-.97, -1.24, .945, .975]]); cols = []; diag = []   # Kuma: finer at the outer corner     # (-0.97: the rim turns up steeply into the inner corner)
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
        hug = bool(L8_HUG and np.isfinite(de).any())
        if hug:                                  # Kuma: just off the eyeball (the whole eye in this column, not only the opening: no crack)
            de_all = eye_dist(x, pivot, np.linspace(pl - .06, pt_ + .03, 40), tag); r_body = max(maxeye, float(de_all.max())) + L8_GH
        # the crossing: where the skin passes behind... the first angle above the top rim with the skin beyond r_body
        above = (phs > pt_) & (dsk > r_body)
        px = float(phs[np.argmax(above)]) if above.any() else pb
        r_edge = min(r_body, max(maxeye + L8['G_EDGE'], float(np.interp(pl, phs, dsk)) - L8['TUCK'])) if np.isfinite(de).any() else r_body
        if hug: r_edge = r_body
        pe = pl - .004                       # shut, every column's edge sits just under the lower rim: one clean lash curve
        # Kuma (rig round 2): at the squint the edge rises toward the outer corner (L8_RISE x EHH per unit X), so it reads level or
        # higher outward in screen space from the front and both 45-degree game cameras; the shut edge stays under the lower rim (min)
        zlx = zlev + L8_RISE * EHH * float(np.clip(X, -1, 1)) + L8_ARCH * EHH * (1 - float(np.clip(X, -1, 1)) ** 2)
        if os.environ.get('L8_LEVEL', '1') == '1' and abs(X) < 1:     # continuous across the columns (clamped into the opening: no folded strip)
            zc_ = min(max(zlx, zl + .001), zt - .0005); pe = min(pe, angp(fy(zc_), zc_) - (target - L8['SQ']))
        dk = .0020 + .0058 * max(0., 1 - min(abs(X), 1.) ** 2) ** .6
        if abs(X) < 1: dk = max(dk, LASH_K * (zb - zt) * max(0., 1 - min(abs(X), 1.) ** 2) ** .25)   # Kuma: as thick as his painted lash band
        if L8_HUG and abs(X) < 1:            # the whole squint-visible part of the lid is lash: it merges with the painted band; shut it is the "U" ribbon
            cov_arc = (pt_ - (pe + target - L8['SQ'])) * r_edge
            if cov_arc > 0: dk = max(dk, (cov_arc + L8_DKX) * max(0., 1 - min(abs(X), 1.) ** 2) ** .35)
        if X < 0: dk = max(.0007, dk * float(smooth(-.98, -.55, X)))      # fades toward the inner corner (no hook)
        if X <= -.999:                       # past the inner corner: the edge well under the corner, no stripe (the interpolated edge stays under the rim)
            pe = angp(fy(EZ - .30 * EHH), EZ - .30 * EHH); dk = 0.
            if X > -1.2:                     # ... and in front of the band's inner end (it reaches X -1.11) (the skin bulges out toward the bridge)
                zone = (phs >= pe) & (phs <= pb); r_body = r_edge = max(r_body, float(np.max(dsk[zone])) + .0005)
        if X < -1.10 or X >= .999:           # the lid's two ends tuck just under the skin all through the sweep (Kuma: the band thins out before the inner corner)
            sw = (phs >= pe - .02) & (phs <= pb + .45)
            r_body = r_edge = float(np.min(dsk[sw])) - .0008; dk = 0.; px = pb
        if X < -1.10 or X >= .999: hug = False
        cols.append(dict(X=X, x=x, pl=pl, pt=pt_, pb=pb, px=px, r_body=r_body, r_edge=r_edge, pe=pe, dk=dk, phs=phs, dsk=dsk, maxeye=maxeye, hug=hug, d_bt=d_bt))
        if os.environ.get('LID_PROBE') and abs(X) < .05:
            sel = np.arange(0, len(phs), 12)
            print('LID_PROBE', tag, 'X', round(X, 2), 'pl pt pb', round(pl, 3), round(pt_, 3), round(pb, 3), 'maxeye', round(maxeye, 4), 'd_bt', round(d_bt, 4),
                  'eye(ph)', [(round(float(a_), 3), round(float(b_), 4)) for a_, b_ in zip(po[::4], de[::4]) if np.isfinite(b_)],
                  'skin(ph)', [(round(float(phs[k]), 3), round(float(dsk[k]), 4)) for k in sel], flush=True)
        diag.append((round(X, 2), round(r_body, 4), round((r_body - r_edge) * 1000, 1), round((px - pb) * r_body * 1000, 1),
                     round((pe - pl) * r_body * 1000, 1), round((r_body - maxeye) * 1000, 1)))
    if L8_HUG and os.environ.get('L8_ENDHUG', '1') == '1':
        # Kuma: the outer end column follows its neighbour just inside it (no eye-white sliver at the outer corner when shut)
        cE, cN = cols[-1], cols[-2]
        if cE['X'] >= .999 and cN['hug']:
            de_ = eye_dist(cE['x'], pivot, np.linspace(cN['pl'] - .05, cN['pt'] + .05, 25), tag); rE = max(cN['r_edge'] - .0006, float(de_.max()) + L8_GH)
            cE.update(r_body=rE, r_edge=rE, pe=cN['pe'], px=cN['px'], pb=cN['pb'], pt=cN['pt'], pl=cN['pl'], phs=cN['phs'], dsk=cN['dsk'], hug=True, dk=0.)
    V = []; UVs = []; NRM = []; G = []; ARC = []; out_cols = []
    nr = len(ROWS8)
    for i, c in enumerate(cols):
        dk = c['dk']; ramp = max(min(.85 * dk, dk - .0007), 1e-4)
        ph_dark = c['pe'] + max(1.05 * dk, .004) / c['r_edge']; ph_top = max(c['px'], c['pb']) + .03
        if c['hug']:                     # one row layout for every hugging column (no folded quads between columns of unlike dk)
            ph_dark = c['pe'] + .11; ph_top = max(ph_top, c['pb'] + .05, ph_dark + .06)
        g_row = []; a_row = []
        for t in ROWS8:
            ph = c['pe'] + (ph_dark - c['pe']) * t / .15 if t <= .15 else ph_dark + (ph_top - ph_dark) * (t - .15) / .85
            arc = (ph - c['pe']) * c['r_edge']
            k = float(ns['smoother'](0, ramp, arc)) if arc < ramp else 1.
            r = c['r_edge'] + (c['r_body'] - c['r_edge']) * k
            if c['hug']:
                # over the opening (shut) just off the eye; over the painted band (shut) just outside the skin, so the closed lid
                # covers the band (one "U" lash line, no ring); above the band a constant radius (under the skin there)
                sk_ = float(np.interp(min(ph, c['pb'] + .02), c['phs'], c['dsk'])) + L8_DB
                w_ = float(ns['smoother'](c['pt'] - .02, c['pt'] + .01, ph))
                r = (1 - w_) * c['r_edge'] + w_ * max(c['r_edge'], sk_)
            ph_rest = ph + target
            V.append((c['x'], yp - r * math.cos(ph_rest), zp + r * math.sin(ph_rest))); UVs.append((i / (len(cols) - 1), t))
            py_t = yp - r * math.cos(ph); pz_t = zp + r * math.sin(ph)
            g_row.append((c['x'], py_t, pz_t)); a_row.append(arc); NRM.append((c['x'], r, ph))
        G.append(g_row); ARC.append(a_row); out_cols.append((c['x'], c['r_body'], c['pe'], ph_top))
    # shading normals: the skin ball's normal under each vertex (over the opening too: the shut lid is that skin), averaged in the lid's
    # own frame over every blink angle at which that vertex shows (shut weighted 3x), so the half-closed lid meets the skin
    # around it without a lighter or darker patch (one rigid normal can't be exact at every angle; this halves the worst error)
    XR = np.array(NRM); acc = np.zeros((len(XR), 3)); wsum = np.zeros(len(XR))
    W_SHUT = float(os.environ.get('W_SHUT', '40')); W_SQ = float(os.environ.get('W_SQ', '8'))
    for a in np.r_[np.linspace(0, target, 13), L8['SQ']]:
        pa = XR[:, 2] + (target - a)
        Pp = np.stack([XR[:, 0], yp - XR[:, 1] * np.cos(pa), zp + XR[:, 1] * np.sin(pa)], -1)
        vis = head_sdf(Pp) > -.0006
        Q = Pp.copy()                         # the convex ball's own normal under the lid (round 8: no socket, so no membrane)
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * ns['grad_n'](Q)
        n = ns['grad_n'](Q); c_, s_ = math.cos(-a), math.sin(-a)
        nb = np.stack([n[:, 0], n[:, 1] * c_ - n[:, 2] * s_, n[:, 1] * s_ + n[:, 2] * c_], -1)
        w = np.where(vis, W_SHUT if a == target else (W_SQ if a == L8['SQ'] else 1.), 0.)   # Kuma: the shut and squint poses dominate (no disc)
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
          'squint_cover', [round(v, 2) for v in covs], flush=True)
    paint = {'G': np.array(G), 'arc': np.array(ARC), 'X': np.array([c['X'] for c in cols]), 'rows': np.array(ROWS8),
             'dark': np.array([c['dk'] for c in cols]),
             # the shut "U" ribbon: where the lid's arc crosses the lower rim when shut (the edge itself is far under the cheek)
             'shut_arc': np.array([max(0., (c['pl'] - c['pe']) * c['r_edge']) if c['hug'] else 0. for c in cols]),
             'shut_w': np.array([L8_RIB * max(0., 1 - min(abs(c['X']), 1.) ** 2) ** .30 if c['hug'] else 0. for c in cols])}
    return V, UVs, fs, pivot, out_cols, target, NRM, closure, paint

# ---------------------------------------------------------------- tilted lid hinges (HERO_MODELS lidTilt; the Floofy construction)
# The game turns lidU / lidD about (cos t, 0, -/+ sin t) in game axes (L / R) = Blender (cos t, +/- sin t, 0): a horizontal hinge
# square to each eye's outward-facing axis, through the lid bone's head. Each lid is designed in its eye's own frame (the head and
# the eye rotated about the vertical through the eye's surface centre so the eye faces -Y and the hinge is X), with the round-8
# construction unchanged, then rotated back. Kuma's eyes face 18.8 deg out: t = 0.328.
LID_TILT = float(os.environ.get('LID_TILT', '.361'))   # Tanu's eyes face 20.7 deg out (the model's eye_axis): t = 0.361
HEAD_SDF_W = head_sdf; FRONT_HIT_W = front_hit; GRAD_N_W = ns['grad_n']
def Rz(phi):
    c, s_ = math.cos(phi), math.sin(phi); return np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1.]])
EYE_FRAME = {}
for tag_, s_ in (('L', 1), ('R', -1)):
    Sc_ = np.array([s_ * EX, float(FRONT_HIT_W(s_ * EX, EZ)[0]), EZ])
    EYE_FRAME[tag_] = {'Sc': Sc_, 's': s_, 'Rw': Rz(s_ * LID_TILT), 'Rl': Rz(-s_ * LID_TILT)}
def hinge(tag): return EYE_FRAME[tag]['Rw'] @ np.array([1., 0, 0])
def to_world(q, tag):
    f_ = EYE_FRAME[tag]; q = np.asarray(q, float); return f_['Sc'] + (q - f_['Sc']) @ f_['Rw'].T
def to_local(p, tag):
    f_ = EYE_FRAME[tag]; p = np.asarray(p, float); return f_['Sc'] + (p - f_['Sc']) @ f_['Rl'].T
print('LID_TILT', LID_TILT, 'hinge L', hinge('L').round(4).tolist(), 'R', hinge('R').round(4).tolist(), flush=True)
HV_W = np.array([v.co[:] for v in head.data.vertices]); TRI_W = [tuple(t.vertices) for t in head.data.loop_triangles]; SKIN_V = np.array(ns['verts'])
def eye_context(tag):
    f_ = EYE_FRAME[tag]; s_ = f_['s']
    sk_t = BVHTree.FromPolygons([Vector(p) for p in to_local(HV_W, tag)], TRI_W)          # the approved (uncut) skin
    eo = OBJ['Tanu_eye_' + tag]; EVl = to_local(np.array([list(v.co) for v in eo.data.vertices]), tag)
    ey_t = BVHTree.FromPolygons([Vector(p) for p in EVl], [tuple(p.vertices) for p in eo.data.polygons])
    rimL = to_local(SKIN_V[ns['roll_info'][s_][0]], tag)               # the eyelid hole's rim loop, in the eye's frame
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
    def front_hit_l(x, z, f=None): return FRONT_HIT_W(x, z, f if f is not None else hsdf_l)
    def grad_n_l(p, f=None): return ns['grad'](f if f is not None else hsdf_l, p)
    return {'front_hit': front_hit_l, 'head_sdf': hsdf_l, 'skin_tree': sk_t, 'eye_tree': ey_t,
            'EX': EXl, 'EZ': EZl, 'EHW': EHWl, 'EHH': EHHl, 'eye_s': eye_s_l, 'eye_xz': eye_xz_l, 'grad_n': grad_n_l,
            'fit': [round(EXl, 4), round(EZl, 4), round(EHWl, 4), round(EHHl, 4)]}
SWAP = {}
def enter(tag):
    ctx = eye_context(tag); g = globals(); s_ = EYE_FRAME[tag]['s']
    for k in ('front_hit', 'head_sdf', 'skin_tree', 'EX', 'EZ', 'EHW', 'EHH'):
        SWAP[k] = g[k]; g[k] = ctx[k]
    SWAP['eye_tree'] = g['eye_tree']; g['eye_tree'] = {tag: ctx['eye_tree']}
    for k in ('eye_s', 'eye_xz', 'grad_n'):
        SWAP['ns:' + k] = ns[k]; ns[k] = ctx[k]
    ps_ = np.linspace(0, 2 * math.pi, 72, endpoint=False); rx_, rz_ = ctx['eye_xz'](s_, ps_, 1.02)
    ry_ = ctx['front_hit'](rx_, rz_); SWAP['RIM_N'] = dict(RIM_N)
    RIM_N[tag] = (np.stack([rx_, rz_], -1), ctx['grad_n'](np.stack([rx_, ry_, rz_], -1)))
    print('EYE_FRAME', tag, 'fit EX EZ EHW EHH', ctx['fit'], flush=True)
def leave():
    g = globals()
    for k, v in SWAP.items():
        if k.startswith('ns:'): ns[k[3:]] = v
        elif k == 'RIM_N': RIM_N.clear(); RIM_N.update(v)
        else: g[k] = v
    SWAP.clear()
def rot_axis(V, Pv, axis, ang):
    k = np.asarray(axis, float) / np.linalg.norm(axis); d = np.asarray(V, float) - Pv
    c, s_ = math.cos(ang), math.sin(ang)
    return Pv + d * c + np.cross(k, d) * s_ + np.outer(d @ k, k) * (1 - c)
# ---------------------------------------------------------------- Kuma (rig round 2): the lower lid hugs the eye on the upper lid's hinge
# One radius per column (the eyeball's distance from the hinge at the eye's centre of curvature, +1.5 mm), so the lid slides over the
# eye without a jagged or floating edge; its up-arched edge covers ~30 % at the design angle LD_T and sits under the lower rim at the
# game's neutral -0.10; just below the rim the shell steps out onto the skin over the painted lower rim line (no "spectacle" ring)
# and then dives into the cheek.
LDH_ROWS = [0, .04, .09, .15, .22, .30, .38, .46, .54, .62, .70, .78, .86, .93, 1.0]
def lower_lid_hug(tag):
    s = 1 if tag == 'L' else -1; cx = s * EX; ye = float(front_hit(cx, EZ)[0]); target = LD_T
    yp, zp = ye + L8['YB'], EZ + LOG_HUG[tag]['zo']; pivot = np.array([cx, yp, zp])
    def angp(y, z): return math.atan2(z - zp, yp - y)
    Xs = np.linspace(-.97, .97, 23); cols = []
    for X in Xs:
        x = cx + s * EHW * X
        zl = float(outline_z(X, False)); fy = lambda z: float(front_hit(np.array([x]), np.array([z]))[0])
        po = np.arange(angp(fy(zl), zl) - .02, angp(fy(EZ + .3 * EHH), EZ + .3 * EHH), .006); de = eye_hits(x, pivot, po, tag)
        r = (float(np.nanmax(de)) if np.isfinite(de).any() else float(eye_dist(x, pivot, [angp(fy(zl), zl)], tag)[0])) + LDH_GAP
        za = (EZ - EHH) + 2 * EHH * (LDH_COV - LDH_ARCH * X * X)                    # the up-arched edge at the design angle
        za = max(za, zl - .004)
        pe = math.asin(max(-1, min(1, (za - zp) / r)))
        phR = math.asin(max(-1, min(1, (zl - zp) / r)))                             # where this radius meets the lower rim
        span = (pe - phR) + LD_BAND + LD_DIVE + .05
        phs = pe - np.array(LDH_ROWS) * span
        sk = skin_dist(x, pivot, phs)
        rr = []
        for ph, skn in zip(phs, sk):
            on = float(smooth(phR + LD_RAMP, phR + .002, ph)) * (1 - float(smooth(.80, .97, abs(X))))
            dive = float(smooth(phR - LD_BAND, phR - LD_BAND - LD_DIVE, ph))
            r_top = (1 - on) * r + on * max(r, skn + LDH_OFF)
            rr.append((1 - dive) * r_top + dive * (min(r, skn) - .006))
        cols.append(dict(X=X, x=x, r=r, pe=pe, phR=phR, phs=phs, rr=rr))
    V = []; UVs = []; G = []; ARC = []; XR = []
    for i, c in enumerate(cols):
        g_row = []; a_row = []
        for j, (t, ph, r_) in enumerate(zip(LDH_ROWS, c['phs'], c['rr'])):
            pr = ph + target
            V.append((c['x'], yp - r_ * math.cos(pr), zp + r_ * math.sin(pr))); UVs.append((i / (len(cols) - 1), t))
            g_row.append((c['x'], yp - r_ * math.cos(ph), zp + r_ * math.sin(ph))); a_row.append((c['pe'] - ph) * c['r']); XR.append((c['x'], r_, ph))
        G.append(g_row); ARC.append(a_row)
    XR = np.array(XR); acc = np.zeros((len(XR), 3))
    for a, wgt in ((target, 8.), (-.10, 1.), ((target - .10) / 2, 1.)):
        pa = XR[:, 2] + (target - a)
        Pp = np.stack([XR[:, 0], yp - XR[:, 1] * np.cos(pa), zp + XR[:, 1] * np.sin(pa)], -1)
        Q = Pp.copy()
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * ns['grad_n'](Q)
        n = ns['grad_n'](Q); c_, s_ = math.cos(-(target - a)), math.sin(-(target - a))
        acc += wgt * np.stack([n[:, 0], n[:, 1] * c_ - n[:, 2] * s_, n[:, 1] * s_ + n[:, 2] * c_], -1)
    NRM = [tuple(v) for v in acc / np.linalg.norm(acc, axis=1, keepdims=True)]
    nr = len(LDH_ROWS); fs = []
    for i in range(len(cols) - 1):
        for j in range(nr - 1):
            q = i * nr + j; fs.append((q, q + 1, q + nr + 1, q + nr))
    out_cols = [(c['x'], c['r'], c['pe'], c['phs'][-1]) for c in cols]
    paint = {'G': np.array(G), 'arc': np.array(ARC), 'X': np.array([c['X'] for c in cols]), 'rows': np.array(LDH_ROWS), 'dark': np.zeros(len(cols))}
    print('LID_LOWER_HUG', tag, 'pivot', pivot.round(4), 'r_centre', round(cols[len(cols) // 2]['r'], 4), flush=True)
    return V, UVs, fs, pivot, out_cols, target, NRM, None, paint
def lid_shell(tag, upper):
    angs = [0.0] if upper else [0.0, -.10]
    cands = np.linspace(-.04, .32, 10) if upper else np.linspace(0, .32, 17)
    best = None
    if upper and LID8:
        g = upper_lid8(tag); e = rest_exposure(g[0], g[3], angs); best = (e, 0., g); cands = []
    if (not upper) and L8_HUG and os.environ.get('LD_HUG', '1') == '1':
        g = lower_lid_hug(tag); best = (0., 0., g); cands = []
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
    if tag == 'L':
        G_ = np.asarray(paint['G']); paint['G'] = to_world(G_.reshape(-1, 3), tag).reshape(G_.shape); LID_PAINT[chart] = paint
    name = ('Tanu_lidU_' if upper else 'Tanu_lidD_') + tag
    Rw_ = EYE_FRAME[tag]['Rw']; pivot_l = np.array(pivot)
    V = to_world(np.array(V), tag).tolist(); NRM = (np.array(NRM) @ Rw_.T).tolist(); pivot = to_world(pivot_l, tag)
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], fs); me.update()
    layer = me.uv_layers.new(name='Atlas')
    for p in me.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer.data[l].uv = au(chart, *UVs[me.loops[l].vertex_index])
    bm = bmesh.new(); bm.from_mesh(me); hk = hinge(tag)
    for f in bm.faces:        # outward = away from the hinge axis
        c = np.array(f.calc_center_median()) - pivot; rv = c - hk * (c @ hk)
        if np.dot(np.array(f.normal), rv) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
    me.normals_split_custom_set([tuple(NRM[me.loops[l].vertex_index]) for l in range(len(me.loops))])
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT)
    lid_objects.append((ob, ('lidU_' if upper else 'lidD_') + tag))
    lid_info[name] = {'pivot': [float(v) for v in pivot], 'pivot_eye_frame': [float(v) for v in pivot_l], 'hinge_blender': [round(float(v), 5) for v in hinge(tag)],
                      'pivot_offset_m': dz, 'score': round(e, 4),
                      'closed_edge_above_rim_mm': None if closure is None else round(closure[0] * 1000, 2),
                      'squint_coverage': None if closure is None else round(closure[1], 3),
                      'closed_standoff_centre_mm': None if closure is None else round(closure[2] * 1000, 2),
                      'radius_centre_m': float(cols[len(cols) // 2][1]), 'target': target}
    return tuple(float(v) for v in pivot)
for tag in 'LR':
    enter(tag)
    try:
        P['lidU_' + tag] = lid_shell(tag, True)
        P['lidD_' + tag] = lid_shell(tag, False)
    finally:
        leave()

# the lid charts: her own face paint (without the upper lash band) under each lid point at its target pose, so a
# closed or squinting lid is the skin it covers; the upper lid carries the thick lash line on its edge, the lower a
# soft crease line
CREASE_C = os.environ.get('CREASE_C', '#C4A392'); CREASE_A = float(os.environ.get('CREASE_A', '1.0'))      # a light fur line (the game renders the mask as one flat dark)
CREASE_W = float(os.environ.get('CREASE_W', '.0034')); CREASE_GAP = float(os.environ.get('CREASE_GAP', '.0020'))
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
        ns['PAINT_OPTS'].update(band=False, blush=False, muzzle=False, maskall=True)   # Tanu: the lids are his dark mask all over
        C = np.asarray(ns['paint_face'](uv[:, 0], uv[:, 1])).reshape(h, w, 3)
        ns['PAINT_OPTS'].update(band=True, blush=True, muzzle=True, maskall=False)
        # her skin as it renders around the socket: the lids carry the eye's (more lit) orientation, so their albedo is
        # set a touch deeper to read as the same skin under the same light
        if chart == 'lidU':
            dk = info['dark'][i0] * (1 - a) + info['dark'][i0 + 1] * a
            C = mix(C, rgb('lash'), 1 - smooth(dk - .0006, dk + .0006, arc))
            if 'shut_arc' in info:      # the solid shut ribbon, from just under the lower rim up its width (continuous into the wing)
                sa = info['shut_arc'][i0] * (1 - a) + info['shut_arc'][i0 + 1] * a; sw_ = info['shut_w'][i0] * (1 - a) + info['shut_w'][i0 + 1] * a
                rib = smooth(sa - .004, sa - .003, arc) * (1 - smooth(sa + sw_ - .0006, sa + sw_ + .0006, arc)) * (sw_ > .0005)
                C = mix(C, rgb('lash'), rib)
                # Tanu: inside the dark mask the ribbon alone barely reads; a lighter crease line along its top (as Pan's) carries
                # the shut "U" in the game light
                tp_ = np.clip(sw_ / max(float(info['shut_w'].max()), 1e-6), 0, 1)
                dA = arc - (sa + sw_ + CREASE_GAP); crease = (1 - smooth(CREASE_W * .55, CREASE_W, np.abs(dA))) * (sw_ > .0005) * (.35 + .65 * tp_)
                C = mix(C, rgb(CREASE_C), CREASE_A * crease)
        else:
            pass                                                                        # Kuma: no crease line on the lower lid (no spectacle rim)
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'tanu-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()


# ---------------------------------------------------------------- mouth: part the skin along the painted "w", add the cavity
_WS = np.array([ns['catmull']([(.0835 * W, MZM + .019 * W), (.076 * W, MZM + .008 * W), (.046 * W, MZM - .009 * W),
                               (.012 * W, MZM - .004 * W), (0, MZM + .001 * W)], q) for q in np.linspace(0, 1, 161)])   # Tanu's painted smile
_WX, _WZ = _WS[::-1, 0], _WS[::-1, 1]                               # the w's centre line, x ascending (the painted stroke)
def smile_z(x):
    return float(np.interp(min(abs(x), .0835 * W), _WX, _WZ))
CUT = .074 * W                                                       # parted for |x| < CUT; the upturned corners stay sealed
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Tanu_head']; uvl = old.uv_layers.active.data
verts = []; vlab = []; vkind = []; faces = []; fuv = []; fno = []; cache = {}; seam = []
def addv(rec, kind):
    co, uv, no, lab = rec
    if kind is None: kind = 'lower' if (lab == 'head_skin' and co.z < smile_z(co.x)) else 'upper'
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
    skin = rr[0][3] == 'head_skin'
    cut = skin and max(r[0].y for r in rr) < HY - .10 and max(abs(r[0].x) for r in rr) < CUT and min(f) < 0 < max(f)
    if cut: emit(clip(rr, True), 'upper'); emit(clip(rr, False), 'lower')     # the seam: coincident upper / lower rims
    else: emit(rr, None)
me = bpy.data.meshes.new('Tanu_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, u in zip(poly.loop_indices, uu): layer.data[l].uv = u
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < .0003) & np.array([l_ == 'head_skin' for l_ in FL])
FN[onsk] = ns['grad_n'](FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Tanu_head'] = vlab
seam = sorted(set(tuple(round(c, 7) for c in p) for p in seam), key=lambda p: p[0])
rim = []
for p in seam:
    if not rim or p[0] - rim[-1][0] > .0016: rim.append(p)
assert len(rim) >= 10, len(rim)
LOG = {'mouth_seam_points': len(rim), **{k: ns['LOG'][k] for k in ('head_refine_before', 'head_refine') if k in ns['LOG']}}

# ---------------------------------------------------------------- weights
def lip_w(x, z):
    return .85 * math.exp(-((abs(x) - CORNER_X) / (.030 * W)) ** 2 - ((z - corner_z) / (.030 * W)) ** 2)
def jaw_w(x, y, z, kind):
    """the lower lip, the muzzle's lower half, the chin and the under-jaw; a smooth falloff into the cheeks (Tanu's cream
    muzzle is 0.40 W wide: the jaw takes |x| < 0.17 W fully, fading out by 0.29 W)"""
    q = M2L(np.array([x, y, z])); xl, yl, zl = q; b = yl - MUZ_FRONT_L
    sharp = 1.0 if kind == 'lower' else 0.0
    field = 1 - sm(-.008 * W, .012 * W, z - smile_z(x))              # beyond the parting: the skin round the sealed corners
    we = sm(.80 * CUT, CUT, abs(x)); below = sharp * (1 - we) + field * we
    lat = 1 - sm(.17, .29, abs(xl)); back = 1 - sm(.36, .52, b)
    return below * lat * back
def face_weights(p, lab, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab == 'nose_button': return {'head': 1}
    q = M2L(np.array(p)); zl = q[2]; yl = q[1]
    lip = lip_w(x, z) * (1 - sm(-.22, -.12, y - HY))
    jw = jaw_w(x, y, z, kind)
    neck = sm(.04, -.03, zl) * sm(.05, .25, yl)                       # the hidden nape on the body blends to the neck
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
def arm_weights(p, side):
    sh = np.array(JA[side]['shoulder']); wr = np.array(JA[side]['wrist'])
    d = wr - sh; t = float((np.array(p) - sh) @ d / (d @ d))
    if t > 1.02: return {'hand_' + side: 1}                                         # the mitten is rigid
    fore = sm(.40, .62, t); hand = sm(.94, 1.02, t); chest = .45 * (1 - sm(-.30, .05, t))
    return {'chest': chest, 'upperarm_' + side: (1 - chest) * (1 - fore), 'forearm_' + side: (1 - chest) * fore * (1 - hand),
            'hand_' + side: (1 - chest) * fore * hand}
def torso_weights(p):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    hips = 1 - sm(.24, .31, z); chest = sm(.37, .45, z); neck = sm(.49, .545, z)
    w = {'hips': hips, 'spine': (1 - hips) * (1 - chest), 'chest': (1 - hips) * chest * (1 - neck), 'neck': (1 - hips) * chest * neck}
    arm = .40 * sm(.13, .19, abs(x)) * sm(.41, .47, z) * (1 - sm(.53, .57, z))          # the shoulder follows the arm a little
    thigh = .55 * (1 - sm(.12, .21, z)) * sm(.02, .08, abs(x))                          # the seat and the leg tops follow the thighs
    out = {k: v * (1 - arm) * (1 - thigh) for k, v in w.items()}
    out['upperarm_' + side] = arm * (1 - thigh); out['thigh_' + side] = thigh
    return out
def ear_weights(p, s):
    C0, ne, up, tt = ns['ear_info'][s]; R_E = .160 * W; tag = 'L' if s > 0 else 'R'
    h = float((np.array(p) - C0) @ up) / R_E                          # -1 (bottom of the disc) .. +1 (top)
    tip = sm(-.05, .65, h)
    return {'ear_' + tag: 1 - tip, 'earTip_' + tag: tip}
def leg_weights(p, lab, side):
    x, y, z = p
    if lab.startswith('foot'): return {'foot_' + side: 1}
    hips = .55 * sm(.20, .245, z); shin = 1 - sm(.10, .14, z); foot = 1 - sm(.05, .072, z)
    return {'hips': hips, 'thigh_' + side: (1 - hips) * (1 - shin), 'shin_' + side: (1 - hips) * shin * (1 - foot), 'foot_' + side: (1 - hips) * shin * foot}
_TS = np.linspace(0, 1, 401); _TC = np.array([catmull(TAIL_PTS, t) for t in _TS])
def tail_weights(p):
    """along the tail: tail1 at the root .. tail4 at the end dome (the dome itself rigid to tail4)"""
    d = np.linalg.norm(_TC - np.array(p), axis=1); k = int(np.argmin(d)); t = float(_TS[k])
    if k == len(_TS) - 1: t = 1.0
    T = TAIL_T
    if t <= T[0]: return {'tail1': 1}
    if t >= T[3]: return {'tail4': 1}
    for i in range(3):
        if T[i] <= t <= T[i + 1]:
            f = sm(T[i], T[i + 1], t); return {'tail%d' % (i + 1): 1 - f, 'tail%d' % (i + 2): f}
BAG_C = np.array(ns['BAG_C'])
def satchel_weights(p, lab):
    """the bag, its flap and button hang rigid from `hips` at the hip (measured best, scratch/bag_try2.py: 0 mm into the
    belly in every walk / run phase; on `spine` the run's forward lean pressed it 8 mm in; a thigh share sheared it or
    turned it into the belly); the strap ties in on `hips` and follows spine on the belly and the back, chest over the
    shoulder"""
    x, y, z = p
    if lab in ('satchel_bag', 'satchel_flap', 'satchel_button'): return {'hips': 1}
    near_bag = 1 - sm(.14, .21, float(np.linalg.norm(np.array(p) - BAG_C)))
    ch = sm(.40, .48, z) * (1 - near_bag)
    return {'hips': near_bag, 'spine': (1 - near_bag) * (1 - ch), 'chest': ch}

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
adata = bpy.data.armatures.new('Tanu_game_skeleton'); arm = bpy.data.objects.new('Tanu_Rig', adata); bpy.context.collection.objects.link(arm)
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
            pz = z + (.012 * W if level == 'upper' else -.050 * W) * math.sin(t * math.pi * .5) * corner
            py = y + .0015 + .090 * W * t * (.35 + .65 * corner)
            px = x * (1 - .06 * t)
            if j: py = max(py, skin_front(px, pz) + .005)
            cav_v.append((px, py, pz))
            ww = face_weights((x, y, z), 'head_skin', level)
            sd_ = 'lip_' + ('L' if x >= 0 else 'R')
            if level == 'upper': ww = {'head': 1 - ww[sd_], sd_: ww[sd_]}
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
mouth = make_mesh('Tanu_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
cc = Vector((0, rim[len(rim) // 2][1] + .03, MZM))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()        # faces look into the pocket
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .032              # far enough back that it never shows through the closed lip
tongue_c = np.array([0, ty, MZM - .020 * W]); tr_ = np.array([.058 * W, .042 * W, .012 * W])
tv = []; tf = []; seg, rows_ = 12, 6
for j in range(rows_ + 1):
    ph = math.pi * j / rows_
    for i in range(seg):
        a = 2 * math.pi * i / seg; tv.append(tuple(tongue_c + tr_ * np.array([math.sin(ph) * math.cos(a), math.sin(ph) * math.sin(a), math.cos(ph)])))
for j in range(rows_):
    for i in range(seg): tf.append((j * seg + i, j * seg + (i + 1) % seg, (j + 1) * seg + (i + 1) % seg, (j + 1) * seg + i))
tongue = make_mesh('Tanu_tongue', tv, tf, 'tongue')
bm = bmesh.new(); bm.from_mesh(tongue.data); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-8); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(tongue.data); bm.free()
for l in tongue.data.uv_layers.active.data: l.uv = au('tongue', .5, .5)

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
    pp = [tuple(v.co) for v in o.data.vertices]; lab = labels[o.name]; nm = o.name
    if nm == 'Tanu_head': weights = [face_weights(p, l, k) for p, l, k in zip(pp, lab, vkind)]
    elif nm == 'Tanu_leaf': weights = [{'head': 1} for p in pp]
    elif nm.startswith('Tanu_eye_'): weights = [{'eye_' + nm[-1]: 1} for p in pp]
    elif nm.startswith('Tanu_ear_'): weights = [ear_weights(p, 1 if nm[-1] == 'L' else -1) for p in pp]
    elif nm == 'Tanu_tail': weights = [tail_weights(p) for p in pp]
    elif nm == 'Tanu_body': weights = [torso_weights(p) for p in pp]
    elif nm.startswith('Tanu_arm_'): weights = [arm_weights(p, nm[-1]) for p in pp]
    elif nm.startswith('Tanu_leg_'): weights = [leg_weights(p, l, nm[-1]) for p, l in zip(pp, lab)]
    elif nm == 'Tanu_satchel': weights = [satchel_weights(p, l) for p, l in zip(pp, lab)]
    elif nm == 'Tanu_pouch': weights = [{'hips': 1} for p in pp]
    else: raise KeyError(nm)
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
    angs = np.round(np.linspace(0, 1.22, 13), 3) if bname.startswith('lidU') else np.round([-.10, -.18, LD_T, LD_T - .04], 3)
    enter(tag)                         # measured in the eye's own frame (the opening as the lid sees it)
    for a in angs:
        Vr = to_local(rot_axis(V, piv, hinge(tag), float(a)), tag)
        sd = head_sdf(Vr); sr, psi_, X_, Z_ = ns['eye_s'](s_, Vr[:, 0], Vr[:, 2])
        th = ns['lash_th'](psi_); band = (Z_ > -.05) & (sr <= 1.05 + th)
        esd = np.array([eye_sd(p, tag) for p in Vr])
        near = sd > -.006
        flap = (sr > 1.02) & (sd > .0003) & ~band
        flap_b = (sr > 1.02) & (sd > .0003) & band
        hole = (sr < .97) & (esd < -.0002) & near
        out[float(a)] = [int(flap.sum()), int(flap_b.sum()), int(hole.sum()), round(float(sd[flap].max()) * 1000, 1) if flap.any() else 0]
        if os.environ.get('SWEEP_DIAG') and flap.any() and bname.startswith('lidU'):
            k = np.where(flap)[0]; print('SWEEP_DIAG', bname, a, 'X', np.round(X_[k], 2)[:12].tolist(), 'Z', np.round(Z_[k], 2)[:12].tolist(), 'sd_mm', np.round(sd[k] * 1000, 1)[:12].tolist(), flush=True)
    leave()
    return out
# ---------------------------------------------------------------- the happy squint edge in screen space (front, game cameras yaw +-45)
def edge_report(ang_u=None):
    ang_u = L8['SQ'] if ang_u is None else ang_u
    nr = len(ROWS8); Xs = np.unique(np.r_[np.linspace(-1.14, 1.0, L8['NCOL']), [-.97, -1.24, .945, .975]]); out = {}
    def cam_up(yaw, pitch):
        if pitch is None: return np.array([0, 0, 1.])
        e = math.radians(pitch); y = math.radians(yaw); d = np.array([math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)])
        u = np.array([0, 0, 1.]) - d * d[2]; return u / np.linalg.norm(u)
    for o, b in lid_objects:
        if not b.startswith('lidU'): continue
        tag = b[-1]; s_e = 1 if tag == 'L' else -1; V = np.array([list(v.co) for v in o.data.vertices]); E = rot_axis(V[::nr][:len(Xs)], np.array(P[b]), hinge(tag), ang_u)
        enter(tag); El = to_local(E, tag)
        vis = [(abs(X) < .98) and (outline_z(X, False) + .004 < El[k, 2] < outline_z(X, True) - .002) for k, X in enumerate(Xs)]
        leave()
        idx = [k for k in range(len(Xs)) if vis[k]]
        if not idx: out[o.name] = 'no visible edge'; continue
        ki, ko = idx[0], idx[-1]
        r = {'visible_X': [round(float(Xs[ki]), 2), round(float(Xs[ko]), 2)]}
        for cam, (yaw, pitch) in {'front': (0, None), 'game+45': (45, 45), 'game-45': (-45, 45)}.items():
            up = cam_up(yaw, pitch)
            hi_, ho_ = float(E[ki] @ up) / W, float(E[ko] @ up) / W
            r[cam] = round(ho_ - hi_, 4)
            enter(tag); rimp = to_world(np.array([[s_e * EX + s_e * EHW * xx, float(front_hit(s_e * EX + s_e * EHW * xx, EZ)[0]), EZ] for xx in (-.95, .95)]), tag); leave()
            r[cam + '_eye_axis'] = round(float((rimp[1] - rimp[0]) @ up) / W, 4)
        out[o.name] = r
    return out
def shut_diag(ang=1.22):
    out = {}
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE'); w_, h_ = img.size
    px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    for o, b in lid_objects:
        if b != 'lidU_L': continue
        me = o.data; tag = 'L'; piv = np.array(P[b]); hk = hinge(tag)
        V = np.array([v.co[:] for v in me.vertices]); Vs = rot_axis(V, piv, hk, ang)
        lv = np.empty(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
        CN = np.empty(len(me.loops) * 3); me.corner_normals.foreach_get('vector', CN); CN = CN.reshape(-1, 3)
        Ns = rot_axis(CN, np.zeros(3), hk, ang)
        Pc = Vs[lv]; sd = head_sdf(Pc); front = sd > -.0005
        Q = Pc.copy()
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * ns['grad_n'](Q)
        Nb = ns['grad_n'](Q); angd = np.degrees(np.arccos(np.clip((Nb * Ns).sum(1), -1, 1)))
        uv = np.empty(len(me.loops) * 2); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
        lc = px[np.clip((uv[:, 1] * h_).astype(int), 0, h_ - 1), np.clip((uv[:, 0] * w_).astype(int), 0, w_ - 1), :3]
        d = Q - ns['O']; d /= np.linalg.norm(d, axis=1, keepdims=True); fu = au('face', *ns['head_uv'](d).T)
        fc = px[np.clip((fu[:, 1] * h_).astype(int), 0, h_ - 1), np.clip((fu[:, 0] * w_).astype(int), 0, w_ - 1), :3]
        dc = np.abs(lc - fc).max(1) * 255
        enter('L'); Vl = to_local(Vs, 'L'); srv = ns['eye_s'](1, Vl[:, 0], Vl[:, 2])[0]; leave()
        egap_v = np.array([(Vector(v) - eye_tree['L'].find_nearest(Vector(v))[0]).length for v in Vs]) * 1000
        egap = egap_v[lv]; overo = (srv[lv] < .95) & front

        out[b] = {'n_front': int(front.sum()), 'normal_dev_deg_p50_p90_max': [round(float(np.percentile(angd[front], q)), 2) for q in (50, 90, 100)],
                  'paint_diff_255_p50_p90': [round(float(np.percentile(dc[front], q)), 1) for q in (50, 90)],
                  'standoff_mm_p50_p90': [round(float(np.percentile(sd[front] * 1000, q)), 2) for q in (50, 90)],
                  'eye_gap_mm_over_opening_p10_p50_p90': [round(float(np.percentile(egap[overo], q)), 1) for q in (10, 50, 90)] if overo.any() else None}
    return out
def ld_diag():
    for o, b in lid_objects:
        if b != 'lidD_L': continue
        V = np.array([v.co[:] for v in o.data.vertices]); Vr = rot_axis(V, np.array(P[b]), hinge('L'), LD_T)
        enter('L'); Vl = to_local(Vr, 'L'); sd = head_sdf(Vl); sr = ns['eye_s'](1, Vl[:, 0], Vl[:, 2])[0]; leave()
        m = sr > 1.0
        print('LD_DIAG outside-opening verts', int(m.sum()), 'of', len(V), 'sd_mm (sr 1.00-1.06):', np.round(np.sort(sd[(sr > 1.0) & (sr < 1.06)] * 1000), 1)[:: max(1, int(((sr > 1.0) & (sr < 1.06)).sum()) // 15)].tolist(), flush=True)
ld_diag()
print('SHUT_DIAG', json.dumps(shut_diag()), 'SQUINT', json.dumps(shut_diag(L8['SQ'])), flush=True)
SWEEP = {o.name: lid_sweep(o, b) for o, b in lid_objects}
EDGE = edge_report(); print('EDGE', json.dumps(EDGE), flush=True)
print('LID_SWEEP', json.dumps(SWEEP), flush=True)
sd = head_sdf(np.array([list(v.co) for v in tongue.data.vertices]))
hidden['Tanu_tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
assert hidden['Tanu_tongue@rest']['outside_count'] == 0, hidden['Tanu_tongue@rest']
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tanu-toy_rig.blend'))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]]} for b in HERO],
       'triangles': total, 'lidTilt': LID_TILT, 'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'}, 'lids': lid_info, 'lids_hidden_check': hidden, 'lid_sweep': SWEEP, 'happy_edge_screen': EDGE, 'lid_hinge_fit': LOG_HUG, **LOG,
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids are surfaces of revolution about their bone X axis: a rotation slides them along themselves.',
                 'Weights quantized to an exact 255 sum; <= 4 influences; the leaf rigid to head; ears ear_ -> earTip_; the tail along tail1-4; the satchel bag on hips, its strap hips -> spine -> chest; the pouch on hips.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2))
print('TANU_RIG', json.dumps({'bones': len(HERO), 'triangles': total, 'hidden': hidden}), flush=True)
