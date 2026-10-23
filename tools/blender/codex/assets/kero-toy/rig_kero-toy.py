"""Kero (kero-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, the game's world-axis contract.

    blender --background --factory-startup --python rig_kero-toy.py

Runs build_kero-toy.py in RIG_MODE (part labels; lid / cavity / tongue charts in unused atlas space, a separate rig atlas;
the approved GLB, blend, atlas and json files are not touched), then adds (after Kuma's rig, which follows Rosie's):
  - the armature: exactly the hero contract, identity rest orientations, heads at the joints; no ears or tail, so
    ear_* / earTip_* sit near the dome tops and tail1-4 behind the hips, all unweighted;
  - eyelids on the game's tilted hinges (HERO_MODELS lidTilt = the eyes' measured outward facing): each lid is designed in
    its eye's own frame (the head turned so the eye faces -Y) as rigid shells of revolution, then turned back.
    The upper lid (Kuma's round 8 + hug): one radius per column just off the eyeball, so it hugs the eye through the blink;
    above the opening it covers the painted lash band from the first frame, and its own dark edge stripe carries the lash
    line down. Shut, that stripe is one solid "U" ribbon under the lower rim, running into the painted outer band and the
    wing. Its shading normals are the skull's own, weighted 40x toward the shut pose and 8x toward the squint.
    The lower lid hugs the eye with an up-arched edge;
  - the mouth: the skin parted along the painted smile between sealed corners, a closed cavity and a tongue; the lower
    lip, the chin and the under-jaw ride `jaw`, the corners `lip_*`;
  - weights (spatial fields + part labels, <= 4 influences, quantized to an exact 255 sum);
and saves kero-toy_rig.blend (only Armature modifiers) and joints-rig.json.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'build_kero-toy.py').read_text(encoding='utf-8')
ns = {'__file__': str(ROOT / 'build_kero-toy.py'), '__name__': 'kero_model', 'RIG_MODE': True}
exec(compile(src, str(ROOT / 'build_kero-toy.py'), 'exec'), ns)
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MHW = ns['MHW']
smooth, au, MAT, M2L = ns['smooth'], ns['au'], ns['MAT'], ns['M2L']
head_sdf, front_hit = ns['head_sdf'], ns['front_hit']
def sm(a, b, x): return float(smooth(a, b, x))
ENV = lambda k, d: float(os.environ.get(k, d))
LID_CLOSE = ENV('LID_CLOSE', '1.10')
RIB_W = ENV('RIB_W', '.20')        # the shut ribbon's width (eye heights): ~0.02 W on screen     # HERO_MODELS lidClose: the upper lid's full-blink angle (Kero: 1.10, scratch/lidgeo5.py)

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
print('OBJECTS', sorted(OBJ), flush=True)

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
JA, JL = ns['joint_arms'], ns['joint_legs']
mouth_y = float(front_hit(0., CHIN + .231 * W)[0])
corner_z = CHIN + .250 * W
P = {'root': (0, -.010, 0), 'hips': (0, -.004, .250), 'spine': (0, -.004, .340), 'chest': (0, -.006, .450), 'neck': (0, -.010, .550),
     'head': (0, .045, CHIN + .006),                                   # the skull base: the nod pivot at the back of the neck, chin height
     'jaw': (0, mouth_y + .22 * W, corner_z)}                          # the hinge line inside the head, 0.22 W behind the mouth
DOME = ns['DOME']
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    bx = .289 * W; bz = CHIN + .605 * W
    P['brow_' + tag] = (s * bx, float(front_hit(s * bx, bz)[0]) + .012, bz)
    P['lip_' + tag] = (s * MHW, float(front_hit(s * MHW, corner_z)[0]) + .002, corner_z)
    # no ears: the ear bones sit near the dome tops (unweighted), earTip a little up and out
    dt = ns['L2M'](np.array([s * DOME['x'], DOME['y'], .60]))
    P['ear_' + tag] = tuple(float(c) for c in dt)
    P['earTip_' + tag] = tuple(float(c) for c in dt + np.array([s * .015, 0, .045]))
    P['upperarm_' + tag] = tuple(JA[tag]['shoulder']); P['forearm_' + tag] = tuple(JA[tag]['elbow']); P['hand_' + tag] = tuple(JA[tag]['wrist'])
    P['thigh_' + tag] = tuple(JL[tag]['hip']); P['shin_' + tag] = tuple(JL[tag]['knee']); P['foot_' + tag] = tuple(JL[tag]['ankle'])
for i, dy in enumerate((.150, .200, .240, .275)):                       # no tail: tail1 inside the body behind the hips, 2-4 along (unweighted)
    P['tail%d' % (i + 1)] = (0., dy, .240)

# ---------------------------------------------------------------- BVHs of the approved skin and eyes
head = OBJ['Kero_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Kero_eye_' + t].data.vertices],
                                    [tuple(p.vertices) for p in OBJ['Kero_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None

# ---------------------------------------------------------------- lid helpers (Kuma's; used inside each eye's own frame)
def outline_z(X, top):
    a = np.clip(np.abs(X), 0, 1); return EZ + (1 if top else -1) * EHH * (1 - a ** EN) ** (1 / EN)
def skin_dist(x, pivot, phs, tmax=.40):
    """distance from the pivot to the outermost skin crossing along the rays (0, -cos ph, sin ph) in the plane x"""
    phs = np.asarray(phs, float); n = len(phs)
    d = np.stack([np.zeros(n), -np.cos(phs), np.sin(phs)], -1); o = np.array([x, pivot[1], pivot[2]])
    ts = np.linspace(tmax, .02, int(161 * tmax / .34))
    Pp = o + ts[None, :, None] * d[:, None, :]
    ins = (head_sdf(Pp.reshape(-1, 3)) < 0).reshape(n, len(ts)); i = np.argmax(ins, 1)
    lo = ts[i]; hi = ts[np.maximum(i - 1, 0)]
    for _ in range(12):
        m = (lo + hi) / 2; inn = head_sdf(o + d * m[:, None]) < 0
        lo = np.where(inn, m, lo); hi = np.where(inn, hi, m)
    return np.where(ins.any(1), (lo + hi) / 2, tmax)
def eye_dist(x, pivot, phs, tag, tmax=.40):
    out = []
    for ph in phs:
        d = Vector((0, -math.cos(ph), math.sin(ph))); o = Vector((x, pivot[1], pivot[2]))
        h = eye_tree[tag].ray_cast(o + d * tmax, -d, tmax)
        out.append(tmax - h[3] if h[0] is not None else 0.)
    return np.array(out)
def eye_hits(x, pivot, phs, tag):
    """outermost VISIBLE eye surface (front projection inside the opening) along the hinge rays; nan elsewhere"""
    s_ = 1 if tag == 'L' else -1; out = np.full(len(phs), np.nan)
    for i, ph in enumerate(phs):
        d = Vector((0, -math.cos(ph), math.sin(ph))); o = Vector((x, pivot[1], pivot[2]))
        h = eye_tree[tag].ray_cast(o + d * .45, -d, .45)
        if h[0] is not None and float(ns['eye_s'](s_, h[0].x, h[0].z)[0]) < 1.0: out[i] = .45 - h[3]
    return out
def eye_sd(p, tag):
    loc, nrm, idx, dist = eye_tree[tag].find_nearest(Vector(p), .3)
    if loc is None: return .3
    return dist if (Vector(p) - loc).dot(nrm) >= 0 else -dist

# ---------------------------------------------------------------- the upper lid (Kuma's round 8 with the hug)
OUTER_X = [1.02, 1.06, 1.10, 1.15, 1.20, 1.26, 1.32, 1.38]          # Kero: lid columns past the outer rim (they cover the painted outer band when shut)
L8 = dict(YB=ENV('L8_YB', '.160'), ZO=ENV('L8_ZO', '-.080'), SQ=ENV('L8_SQ', '.40'), COV=ENV('L8_COV', '.15'), DELTA=.0003, G_BODY=.0008, G_EDGE=.0006, TUCK=.0005, NCOL=23)
ROWS8 = [0, .025, .05, .075, .10, .125, .15] + [float(v) for v in np.linspace(.15, 1, 11)[1:]]
LASH_K = ENV('LASH_K', '.85'); L8_RISE = ENV('L8_RISE', '.16'); L8_GH = ENV('L8_GH', '.0015'); L8_DKX = ENV('L8_DKX', '.003')
L8_DB = ENV('L8_DB', '.0015'); L8_RIB = ENV('L8_RIB', '.020'); L8_ARCH = ENV('L8_ARCH', '0'); LOG_HUG = {}
W_SHUT, W_SQ = ENV('W_SHUT', '40'), ENV('W_SQ', '8')
def upper_lid8(tag):
    s = 1 if tag == 'L' else -1; cx = s * EX; ye = float(front_hit(cx, EZ)[0]); target = LID_CLOSE
    # Kero: the eye is 0.19 m tall, from the sloped face up onto the near-vertical dome front (a slightly concave profile),
    # so no hinge lets one rigid lid hug it all the way: this one (scratch/lidgeo3.py, the eye's frame) hides the lid under
    # the dome at rest and keeps the squint edge close; per row the radius clears only the eye that row crosses
    yp, zp = ye + L8['YB'], EZ + L8['ZO']; pivot = np.array([cx, yp, zp])
    LOG_HUG[tag] = {'yb': L8['YB'], 'zo': L8['ZO']}
    def angp(y, z): return math.atan2(z - zp, yp - y)
    Xs = np.unique(np.r_[np.linspace(-1.14, 1.0, L8['NCOL']), [-.97, -1.24, .945, .975], OUTER_X, [1.44]]); cols = []; diag = []
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
        hug = bool(np.isfinite(de).any())
        need_ph = need_r = None
        if hug:                                  # just off the eyeball; per row: the eye it crosses from its shut position up
            need_ph = np.linspace(pl - .08, pt_ + .04, 80); de_all = eye_dist(x, pivot, need_ph, tag)
            need_r = np.maximum.accumulate(de_all[::-1])[::-1] + L8_GH
            r_body = float(need_r[0])
            if X < ENV('VIS_ONLY_X', '-.60') and np.isfinite(de).any():   # inner columns: just off the VISIBLE eye (the hidden eyeball beyond
                r_body = maxeye + L8_GH                                     # the opening is under the skin), so the lid fits under the corner skin
            if os.environ.get('PER_ROW', '0') != '1': need_r = None     # one radius per column: hidden at rest in every column (scratch/lidgeo4.py)
        above = (phs > pt_) & (dsk > r_body)
        px = float(phs[np.argmax(above)]) if above.any() else pb
        r_edge = min(r_body, max(maxeye + L8['G_EDGE'], float(np.interp(pl, phs, dsk)) - L8['TUCK'])) if np.isfinite(de).any() else r_body
        if hug: r_edge = r_body
        # shut, every column's edge sits under the lower rim (one clean lash curve); at rest it sits just above that column's
        # painted band top, so short columns (the inner corner) don't sweep a long way over the skin before reaching the opening
        pe = pl - ENV('L8_UNDER', '.030')
        # at the squint the edge rises toward the outer corner, so it reads level or higher outward from the front and both
        # 45-degree game cameras; the shut edge stays under the lower rim (min)
        zlx = zlev + L8_RISE * EHH * float(np.clip(X, -1, 1)) + L8_ARCH * EHH * (1 - float(np.clip(X, -1, 1)) ** 2)
        if abs(X) < 1:
            zc_ = min(max(zlx, zl + .001), zt - .0005); pe = min(pe, angp(fy(zc_), zc_) - (target - L8['SQ']))
        dk = .0020 + .0058 * max(0., 1 - min(abs(X), 1.) ** 2) ** .6
        if abs(X) < 1: dk = max(dk, LASH_K * (zb - zt) * max(0., 1 - min(abs(X), 1.) ** 2) ** .25)
        if abs(X) < 1:                           # the squint-visible part of the lid is lash: it merges with the painted band
            cov_arc = (pt_ - (pe + target - L8['SQ'])) * r_edge
            if cov_arc > 0: dk = max(dk, (cov_arc + L8_DKX) * max(0., 1 - min(abs(X), 1.) ** 2) ** .35)
        if X < 0: dk = max(.0007, dk * float(smooth(-.98, -.55, X)))      # fades toward the inner corner (no hook)
        if X <= -.999:                           # past the inner corner: the edge well under the corner, no stripe
            pe = angp(fy(EZ - .30 * EHH), EZ - .30 * EHH); dk = 0.
            if X > -1.2:
                zone = (phs >= pe) & (phs <= pb); r_body = r_edge = max(r_body, float(np.max(dsk[zone])) + .0005)
        if X >= .999 and X < 1.42:               # Kero: shut, these cover the painted outer band and the wing just over the skin;
            zlo, zhi = EZ - .70 * EHH, EZ + .70 * EHH # the lid carries its own lash there (the U's wing flick)
            pe = angp(fy(zlo), zlo); phw = angp(fy(zhi), zhi); zone = (phs >= pe) & (phs <= phw)
            r_body = r_edge = float(np.max(dsk[zone])) + L8_DB; dk = 0.; px = pb = phw; hug = False
        if X < -1.10 or X >= 1.42:               # the lid's two ends tuck just under the skin all through the sweep
            sw = (phs >= pe - .02) & (phs <= pb + .45)
            r_body = r_edge = float(np.min(dsk[sw])) - .0008; dk = 0.; px = pb
        if X < -1.10 or X >= 1.42: hug = False
        cols.append(dict(X=X, x=x, pl=pl, pt=pt_, pb=pb, px=px, r_body=r_body, r_edge=r_edge, pe=pe, dk=dk, phs=phs, dsk=dsk, maxeye=maxeye, hug=hug, d_bt=d_bt, need_ph=need_ph, need_r=need_r))
        diag.append((round(X, 2), round(r_body, 4), round((px - pb) * r_body * 1000, 1), round((pe - pl) * r_body * 1000, 1), round((r_body - maxeye) * 1000, 1)))
    cE, cN = cols[-1], cols[-2]                  # the outer end column follows its neighbour (no eye-white sliver when shut)
    if False and cE['X'] >= .999 and cN['hug']:
        de_ = eye_dist(cE['x'], pivot, np.linspace(cN['pl'] - .05, cN['pt'] + .05, 25), tag); rE = max(cN['r_edge'] - .0006, float(de_.max()) + L8_GH)
        cE.update(r_body=rE, r_edge=rE, pe=cN['pe'], px=cN['px'], pb=cN['pb'], pt=cN['pt'], pl=cN['pl'], phs=cN['phs'], dsk=cN['dsk'], hug=True, dk=0.,
                  need_ph=cN['need_ph'], need_r=None if cN['need_r'] is None else np.maximum(cN['need_r'] - .0006, rE))
    V = []; UVs = []; NRM = []; G = []; ARC = []; out_cols = []
    nr = len(ROWS8)
    for i, c in enumerate(cols):
        dk = c['dk']; ramp = max(min(.85 * dk, dk - .0007), 1e-4)
        ph_dark = c['pe'] + max(1.05 * dk, .004) / c['r_edge']; ph_top = max(c['px'], c['pb']) + .03
        if c['hug']:
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
                if ph < c['pt']:      # rows that slide over the painted band mid-blink: at least the band's own skin distance (+ DB)
                    zb_ = (c['phs'] >= c['pt']) & (c['phs'] <= c['pb'] + .02)
                    sk_ = float(c['dsk'][zb_].max()) + L8_DB if zb_.any() else sk_
                w_ = float(ns['smoother'](c['pt'] - ENV('BAND_W', '.30'), c['pt'] - .10, ph))   # the upper rows ride just over the band: it never shows above the lid mid-blink
                r_e = float(np.interp(ph, c['need_ph'], c['need_r'])) if c['need_r'] is not None else c['r_edge']
                r = (1 - w_) * r_e + w_ * max(r_e, sk_)
            ph_rest = ph + target
            V.append((c['x'], yp - r * math.cos(ph_rest), zp + r * math.sin(ph_rest))); UVs.append((i / (len(cols) - 1), t))
            g_row.append((c['x'], yp - r * math.cos(ph), zp + r * math.sin(ph))); a_row.append(arc); NRM.append((c['x'], r, ph))
        G.append(g_row); ARC.append(a_row); out_cols.append((c['x'], c['r_body'], c['pe'], ph_top))
    # shading normals: the skull's own normal under each vertex, averaged in the lid's frame over every blink angle at which
    # it shows, the shut pose weighted 40x and the squint 8x (no disc outline)
    XR = np.array(NRM); acc = np.zeros((len(XR), 3))
    for a in np.r_[np.linspace(0, target, 13), L8['SQ']]:
        pa = XR[:, 2] + (target - a)
        Pp = np.stack([XR[:, 0], yp - XR[:, 1] * np.cos(pa), zp + XR[:, 1] * np.sin(pa)], -1)
        vis = head_sdf(Pp) > -.0006
        Q = Pp.copy()
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * ns['grad_n'](Q)
        n = ns['grad_n'](Q); c_, s_ = math.cos(-a), math.sin(-a)
        nb = np.stack([n[:, 0], n[:, 1] * c_ - n[:, 2] * s_, n[:, 1] * s_ + n[:, 2] * c_], -1)
        w = np.where(vis, W_SHUT if a == target else (W_SQ if a == L8['SQ'] else 1.), 0.)
        if a == target: w = np.maximum(w, 1e-3)
        acc += w[:, None] * nb
    NRM = [tuple(v) for v in acc / np.linalg.norm(acc, axis=1, keepdims=True)]
    fs = []
    for i in range(len(cols) - 1):
        for j in range(nr - 1):
            q = i * nr + j; fs.append((q, q + nr, q + nr + 1, q + 1))
    clo = max(zp + c['r_edge'] * math.sin(c['pe']) - (outline_z(c['X'], False) - .0015) for c in cols if abs(c['X']) <= .95)
    covs = []
    for c in cols:
        if abs(c['X']) > .9: continue
        ze = zp + c['r_edge'] * math.sin(c['pe'] + target - L8['SQ']); zl, zt = outline_z(c['X'], False), outline_z(c['X'], True)
        covs.append(float(np.clip((zt - ze) / (zt - zl), 0, 1)))
    cc_ = cols[len(cols) // 2]; standoff = cc_['r_body'] - cc_['maxeye']
    closure = (clo, float(np.mean(covs)), standoff)
    print('LID8', tag, 'pivot', pivot.round(4), 'hug', LOG_HUG[tag], 'cols (X, r_body, cross_above_bandtop_mm, edge_below_rim_mm, standoff_mm)', diag,
          'squint_cover', [round(v, 2) for v in covs], flush=True)
    paint = {'G': np.array(G), 'arc': np.array(ARC), 'X': np.array([c['X'] for c in cols]), 'rows': np.array(ROWS8),
             'dark': np.array([c['dk'] for c in cols]),
             'shut_arc': np.array([max(0., (c['pl'] - c['pe']) * c['r_edge']) if (c['hug'] or c['X'] > .99) else 0. for c in cols]),
             'shut_w': np.array([(L8_RIB * (1 - float(smooth(1.0, 1.07, c['X']))) if c['X'] > 0 else L8_RIB * max(0., 1 - min(abs(c['X']), 1.) ** 2) ** .30)
                                 if (c['hug'] or c['X'] > .99) else 0. for c in cols])}       # full thickness to the outer corner: it runs into the band and the wing
    return V, UVs, fs, pivot, out_cols, target, NRM, closure, paint

# ---------------------------------------------------------------- tilted lid hinges (HERO_MODELS lidTilt; the Floofy construction)
# The game turns lidU / lidD about (cos t, 0, -/+ sin t) in game axes (L / R) = Blender (cos t, +/- sin t, 0). Each lid is
# designed in its eye's own frame (the head and the eye rotated about the vertical through the eye's surface centre so the
# eye faces -Y and the hinge is X), then rotated back. Kero's eyes face 27.8 deg out (model round 1): t = 0.485.
LID_TILT = ENV('LID_TILT', '.485')
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
    sk_t = BVHTree.FromPolygons([Vector(p) for p in to_local(HV_W, tag)], TRI_W)
    eo = OBJ['Kero_eye_' + tag]; EVl = to_local(np.array([list(v.co) for v in eo.data.vertices]), tag)
    ey_t = BVHTree.FromPolygons([Vector(p) for p in EVl], [tuple(p.vertices) for p in eo.data.polygons])
    rimL = to_local(SKIN_V[ns['roll_info'][s_][0]], tag)               # the eye hole's rim loop, in the eye's frame
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
    ctx = eye_context(tag); g = globals()
    for k in ('front_hit', 'head_sdf', 'skin_tree', 'EX', 'EZ', 'EHW', 'EHH'):
        SWAP[k] = g[k]; g[k] = ctx[k]
    SWAP['eye_tree'] = g['eye_tree']; g['eye_tree'] = {tag: ctx['eye_tree']}
    for k in ('eye_s', 'eye_xz', 'grad_n'):
        SWAP['ns:' + k] = ns[k]; ns[k] = ctx[k]
    print('EYE_FRAME', tag, 'fit EX EZ EHW EHH', ctx['fit'], flush=True)
def leave():
    g = globals()
    for k, v in SWAP.items():
        if k.startswith('ns:'): ns[k[3:]] = v
        else: g[k] = v
    SWAP.clear()
def rot_axis(V, Pv, axis, ang):
    k = np.asarray(axis, float) / np.linalg.norm(axis); d = np.asarray(V, float) - Pv
    c, s_ = math.cos(ang), math.sin(ang)
    return Pv + d * c + np.cross(k, d) * s_ + np.outer(d @ k, k) * (1 - c)

# ---------------------------------------------------------------- the lower lid hugs the eye on the upper lid's hinge
LD_T = ENV('LD_T', '-.34'); LDH_GAP = ENV('LDH_GAP', '.0015'); LDH_COV = ENV('LDH_COV', '.30'); LDH_ARCH = ENV('LDH_ARCH', '.14'); LDH_OFF = ENV('LDH_OFF', '.0008')
LD_RAMP = ENV('LD_RAMP', '.020'); LD_BAND = ENV('LD_BAND', '.028'); LD_DIVE = ENV('LD_DIVE', '.005')
LDH_ROWS = [0, .04, .09, .15, .22, .30, .38, .46, .54, .62, .70, .78, .86, .93, 1.0]
def lower_lid_hug(tag):
    s = 1 if tag == 'L' else -1; cx = s * EX; ye = float(front_hit(cx, EZ)[0]); target = LD_T
    # its own hinge: the centre of curvature of the eye's lower half (the face part it covers)
    zs_ = np.linspace(EZ - .95 * EHH, EZ - .10 * EHH, 12); ys_ = [ray_y(eye_tree[tag], cx, z_) for z_ in zs_]; best_ = None
    for yb in np.arange(.08, .36, .01):
        for zo in np.arange(.0, .14, .005):        # at or above the eye centre: lowering the lid also slides it back into the head
            pv = np.array([cx, ye + yb, EZ + zo]); dd = [math.hypot(pv[1] - y_, z_ - pv[2]) for z_, y_ in zip(zs_, ys_) if y_ is not None]
            sp = max(dd) - min(dd)
            if best_ is None or sp < best_[0]: best_ = (sp, zo, yb)
    yp, zp = ye + best_[2], EZ + best_[1]; pivot = np.array([cx, yp, zp])
    LOG_HUG[tag + '_lower'] = {'yb': round(float(best_[2]), 3), 'zo': round(float(best_[1]), 4), 'eye_dist_spread_mm': round(best_[0] * 1000, 2)}
    def angp(y, z): return math.atan2(z - zp, yp - y)
    Xs = np.linspace(-.97, .97, 21); cols = []
    for X in Xs:
        x = cx + s * EHW * X
        zl = float(outline_z(X, False)); fy = lambda z: float(front_hit(np.array([x]), np.array([z]))[0])
        po = np.arange(angp(fy(zl), zl) - .02, angp(fy(EZ + .3 * EHH), EZ + .3 * EHH), .006); de = eye_hits(x, pivot, po, tag)
        r = (float(np.nanmax(de)) if np.isfinite(de).any() else float(eye_dist(x, pivot, [angp(fy(zl), zl)], tag)[0])) + LDH_GAP
        za = zl + 2 * EHH * LDH_COV * max(0., 1 - abs(X) ** 2.4) ** .75          # the eye's lower curve raised (an upward arch into the corners)
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
lid_info = {}; lid_objects = []; LID_PAINT = {}; LOG = {}
def cap_radii(V, piv, angs, tag, nr, nc, margin=.0008, eye_gap=.0008, upper=True, rest_max=ENV('REST_MAX', '.10')):
    """(in the eye's frame, hinge = X) shrink the radii of vertices that would stand out of the skin away from the opening
    (and, for the upper lid, away from the painted band it covers when shut) at any test angle. Priority (Kero): at and
    near rest (angle <= rest_max) the lid is always hidden, even if that tucks a vertex behind the eyeball over the
    opening (it then comes out from behind the eye during a blink); at mid-blink angles clearing the eye wins (a frame of
    proud lid is fine). Smoothed over the grid, so the shell stays one rigid smooth surface."""
    s_ = 1 if tag == 'L' else -1; V = np.asarray(V, float); c = V - piv; r = np.hypot(c[:, 1], c[:, 2]); u = c[:, 1:] / r[:, None]
    need_r = np.zeros(len(V)); need_m = np.zeros(len(V)); floor = np.full(len(V), -9.)
    why_v = np.zeros(len(V)); why_a = np.zeros(len(V)); why_X = np.zeros(len(V)); why_Z = np.zeros(len(V)); why_sr = np.zeros(len(V))
    for a in angs:
        Va = rot_axis(V, piv, np.array([1., 0, 0]), a); sr, psi_, X_, Z_ = ns['eye_s'](s_, Va[:, 0], Va[:, 2])
        band = upper & (a > .02) & (Z_ > -.05) & (sr <= 1.06 + ns['lash_th'](psi_))
        op = sr < 1.0; sd = head_sdf(Va); bad = (~op) & (~band) & (sd > -margin)
        if abs(a) <= .02: bad = sd > -margin                      # at rest: under the skin everywhere, over the hole too
        tgt = need_r if abs(a) <= rest_max + 1e-9 else need_m          # rest .. the squint: always hidden
        tol = 0. if abs(a) <= rest_max + 1e-9 else ENV('TOL_MID', '.006')  # mid-blink: up to 6 mm proud is a passing frame
        tgt[bad] = np.maximum(tgt[bad], sd[bad] + margin - tol)
        if abs(a) <= rest_max + 1e-9:
            upd = bad & (sd + margin >= why_v); why_v[upd] = sd[upd] + margin; why_a[upd] = a; why_X[upd] = X_[upd]; why_Z[upd] = Z_[upd]; why_sr[upd] = sr[upd]
        if op.any():
            for i in np.where(op)[0]:
                ph = math.atan2(Va[i, 2] - piv[2], piv[1] - Va[i, 1])
                ed = float(eye_dist(Va[i, 0], piv, [ph], tag)[0])
                if ed <= 0: continue
                if abs(a) <= .02:                 # over the opening at rest: behind the eye's surface (hidden by the eyeball)
                    if r[i] > ed - .0015: need_r[i] = max(need_r[i], r[i] - (ed - .0015))
                elif r[i] >= ed - .002: floor[i] = max(floor[i], ed + eye_gap)
    def smooth_grid(x, it=8):
        sh = x.reshape(nc, nr); raw = sh.copy()
        for _ in range(it):
            p_ = np.pad(sh, 1, mode='edge'); sh = .2 * (p_[1:-1, 1:-1] + p_[:-2, 1:-1] + p_[2:, 1:-1] + p_[1:-1, :-2] + p_[1:-1, 2:])
            sh = np.maximum(sh, raw)
        return sh.ravel()
    shm, shr = smooth_grid(need_m), smooth_grid(need_r, int(ENV('REST_SMOOTH', '2')))
    r_new = np.minimum(np.maximum(r - shm, floor), r - shr)
    out = piv + np.concatenate([np.zeros((len(V), 1)), u * r_new[:, None]], 1); out[:, 0] = V[:, 0]
    tucked = (r_new < floor - 1e-6) & (floor > 0)
    cols_t = sorted(set(int(i // nr) for i in np.where(tucked)[0]))
    if upper and tag == 'L':
        for i in np.where(tucked)[0]: print('TUCK col', i // nr, 'row', i % nr, 'need_mm', round(why_v[i] * 1000, 1), 'at a', round(why_a[i], 2), 'eye X Z sr', round(why_X[i], 2), round(why_Z[i], 2), round(why_sr[i], 2), flush=True)
    return out, {'capped': int(((shm > 1e-6) | (shr > 1e-6)).sum()), 'max_shrink_rest_mm': round(float(shr.max()) * 1000, 1),
                 'max_shrink_mid_mm': round(float(shm.max()) * 1000, 1), 'tucked_behind_eye': int(tucked.sum()), 'tucked_columns': cols_t,
                 'mid_blink_conflicts': int(((r - shm) < floor - 1e-6).sum())}
def lid_shell(tag, upper):
    V, UVs, fs, pivot, cols, target, NRM, closure, paint = upper_lid8(tag) if upper else lower_lid_hug(tag)
    nr_ = len(ROWS8) if upper else len(LDH_ROWS); nc_ = len(V) // nr_
    angs_ = np.r_[np.linspace(0, LID_CLOSE, 25), [.20, .26, .30, .34]] if upper else np.array([.04, 0., -.05, -.10, -.16, -.20, -.24, -.30, -.34])
    Vc, capinfo = cap_radii(V, np.array(pivot), angs_, tag, nr_, nc_, margin=ENV('UP_MARGIN', '.0018') if upper else .0014, upper=upper)
    V = Vc.tolist(); LOG.setdefault('lid_cap', {})[('U' if upper else 'D') + tag] = capinfo
    chart = 'lidU.L' if upper else 'lidD.L'                 # both sides share the left charts (mirror-symmetric paint)
    if tag == 'L':
        G_ = np.asarray(paint['G']); paint['G'] = to_world(G_.reshape(-1, 3), tag).reshape(G_.shape); LID_PAINT[chart] = paint
    name = ('Kero_lidU_' if upper else 'Kero_lidD_') + tag
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

# the lid charts: the face paint (without the lash line) under each lid point at its target pose, so a closed or squinting
# lid is the skin it covers; the upper lid carries the thick lash line on its edge and the solid shut ribbon
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
        Pp = bil(G).reshape(-1, 3); arc = bil(A)
        Q = Pp.copy()                                # the skin point under each lid point (the lid is that skin)
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * ns['grad_n'](Q)
        ns['PAINT_OPTS']['lash'] = False
        C = np.asarray(ns['paint_head_P'](Q)).reshape(h, w, 3)
        ns['PAINT_OPTS']['lash'] = True
        if chart.startswith('lidU'):
            dk = info['dark'][i0] * (1 - a) + info['dark'][i0 + 1] * a
            C = mix(C, rgb('lash'), 1 - smooth(dk - .0006, dk + .0006, arc))
            # Kero: one stroke at the shut pose, in the eye's front-projected coordinates: the U along the lower rim (straddling
            # it) and, at its outer end, a short wing flick rising outward (the shut lid covers the painted outer band and wing)
            sr_, psi_, X_, Z_ = ns['eye_s'](1, Pp[:, 0], Pp[:, 2])
            sr_ = sr_.reshape(h, w); psi_ = psi_.reshape(h, w); X_ = X_.reshape(h, w); Z_ = Z_.reshape(h, w)
            wid = RIB_W * (1 - .70 * smooth(-2.55, -3.05, psi_))                    # tapering into the inner corner
            r_out = 1.035; r_in = r_out - wid
            along = smooth(-3.08, -2.90, psi_) * (1 - smooth(-.50, -.30, psi_))      # the U: inner corner .. the outer-lower corner
            band_ = smooth(r_in - .02, r_in + .01, sr_) * (1 - smooth(r_out - .01, r_out + .02, sr_)) * along
            Pw = np.array([(.90, -.47), (1.00, -.34), (1.10, -.18), (1.20, -.01), (1.29, .14)]); hw_ = np.array([.105, .10, .085, .06, .022])
            dw = np.full(X_.shape, 9.)
            for k_ in range(len(Pw) - 1):
                p0, p1 = Pw[k_], Pw[k_ + 1]; ab = p1 - p0; t_ = np.clip(((X_ - p0[0]) * ab[0] + (Z_ - p0[1]) * ab[1]) / (ab @ ab), 0, 1)
                dd = np.hypot(X_ - (p0[0] + t_ * ab[0]), Z_ - (p0[1] + t_ * ab[1])) - (hw_[k_] * (1 - t_) + hw_[k_ + 1] * t_)
                dw = np.minimum(dw, dd)
            wing = 1 - smooth(-.012, .012, dw)
            C = mix(C, rgb('lash'), np.maximum(band_, wing))
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'kero-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()

# ---------------------------------------------------------------- mouth: part the skin along the painted smile, add the cavity
_MP = np.array(ns['MOUTH_PTS']); _MP = _MP[_MP[:, 0] <= 0][::-1]       # his right half from the centre out: |x| ascending
_SX, _SZ = -_MP[:, 0] * W, CHIN + _MP[:, 1] * W
def smile_z(x): return float(np.interp(abs(x), _SX, _SZ))
CUT = .94 * MHW                                                         # parted for |x| < CUT; the curled corners stay sealed
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Kero_head']; uvl = old.uv_layers.active.data
verts = []; vlab = []; vkind = []; faces = []; fuv = []; fno = []; cache = {}; seam = []
def addv(rec, kind):
    co, uv, no, lab = rec
    if kind is None: kind = 'lower' if (lab == 'kero_head_skin' and co.z < smile_z(co.x)) else 'upper'
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
    skin = rr[0][3] == 'kero_head_skin'
    cut = skin and max(r[0].y for r in rr) < HY - .10 and max(abs(r[0].x) for r in rr) < CUT and min(f) < 0 < max(f)
    if cut: emit(clip(rr, True), 'upper'); emit(clip(rr, False), 'lower')     # the seam: coincident upper / lower rims
    else: emit(rr, None)
me = bpy.data.meshes.new('Kero_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, u in zip(poly.loop_indices, uu): layer.data[l].uv = u
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < .0003) & np.array([l_ == 'kero_head_skin' for l_ in FL])
FN[onsk] = ns['grad_n'](FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Kero_head'] = vlab
seam = sorted(set(tuple(round(c, 7) for c in p) for p in seam), key=lambda p: p[0])
rim = []
for p in seam:
    if not rim or p[0] - rim[-1][0] > .0045: rim.append(p)
assert len(rim) >= 10, len(rim)
LOG.update({'mouth_seam_points': len(rim), 'mouth_cut_half_width_m': round(CUT, 4)})

# ---------------------------------------------------------------- weights
SNOUT_L = float((front_hit(0., CHIN + .22 * W)[0] - HY) / W)            # the snout front (W, head-local y)
def lip_w(x, z):
    return .85 * math.exp(-((abs(x) - MHW) / (.034 * W)) ** 2 - ((z - corner_z) / (.034 * W)) ** 2)
def jaw_w(x, y, z, kind):
    """the lower lip, the chin and the under-jaw (the frog's lower jaw, under the whole smile); a smooth falloff into the
    cheeks, the blush and the jowls' sides stay on the head"""
    q = M2L(np.array([x, y, z])); xl, yl, zl = q; b = yl - SNOUT_L
    sharp = 1.0 if kind == 'lower' else 0.0
    field = 1 - sm(-.008 * W, .012 * W, z - smile_z(x))               # beyond the parting: the skin round the sealed corners
    we = sm(.80 * CUT, CUT, abs(x)); below = sharp * (1 - we) + field * we
    lat = 1 - sm(.24, .36, abs(xl)); back = 1 - sm(.34, .50, b)
    return below * lat * back
def face_weights(p, lab, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    q = M2L(np.array(p)); zl = q[2]; yl = q[1]
    lip = lip_w(x, z) * (1 - sm(-.22, -.12, y - HY))
    jw = jaw_w(x, y, z, kind)
    neck = sm(.05, -.02, zl) * sm(.05, .25, yl)                        # the hidden nape blends to the neck
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
def arm_weights(p, side):
    sh = np.array(JA[side]['shoulder']); wr = np.array(JA[side]['wrist'])
    d = wr - sh; t = float((np.array(p) - sh) @ d / (d @ d))
    if t > 1.05: return {'hand_' + side: 1}                                         # the three-finger hand is rigid
    fore = sm(.40, .62, t); hand = sm(.92, 1.05, t); chest = .45 * (1 - sm(-.30, .05, t))
    return {'chest': chest, 'upperarm_' + side: (1 - chest) * (1 - fore), 'forearm_' + side: (1 - chest) * fore * (1 - hand),
            'hand_' + side: (1 - chest) * fore * hand}
def torso_weights(p):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    hips = 1 - sm(.27, .33, z); chest = sm(.38, .46, z); top = sm(.55, .60, z)
    w = {'hips': hips * (1 - top), 'spine': (1 - hips) * (1 - chest) * (1 - top), 'chest': (1 - hips) * chest * (1 - top), 'neck': .65 * top, 'head': .35 * top}
    arm = .35 * sm(.16, .24, abs(x)) * sm(.42, .50, z) * (1 - sm(.56, .62, z))       # the shoulder follows the arm a little
    thigh = .40 * (1 - sm(.15, .23, z)) * sm(.05, .11, abs(x))                       # the belly's underside over the legs follows them a little
    out = {k: v * (1 - arm) * (1 - thigh) for k, v in w.items()}
    out['upperarm_' + side] = arm * (1 - thigh); out['thigh_' + side] = thigh
    return out
def scarf_weights(p, lab):
    x, y, z = p
    if lab.startswith('scarf_end') or lab == 'lily_pad_badge': return {'chest': 1}     # the knot ends and the badge hang from the chest
    r = .30 * sm(-.06, -.17, y)                                        # the roll follows the chest, riding ~30 % on the neck at the front
    return {'chest': 1 - r, 'neck': r}
def leg_weights(p, side):
    x, y, z = p; hip, knee, ankle = (np.array(JL[side][k]) for k in ('hip', 'knee', 'ankle'))
    rad = math.hypot(x - ankle[0], y - ankle[1])
    foot = max(1 - sm(.088, .125, z), sm(.098, .118, rad) * (1 - sm(.12, .15, z)))   # the broad foot (and its toes) rigid to foot_*
    hips = .55 * sm(.25, .31, z); shin = 1 - sm(.15, .20, z)
    return {'hips': hips * (1 - foot), 'thigh_' + side: (1 - hips) * (1 - shin) * (1 - foot), 'shin_' + side: (1 - hips) * shin * (1 - foot), 'foot_' + side: foot}

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
adata = bpy.data.armatures.new('Kero_game_skeleton'); arm = bpy.data.objects.new('Kero_Rig', adata); bpy.context.collection.objects.link(arm)
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
            ww = face_weights((x, y, z), 'kero_head_skin', level)
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
mouth = make_mesh('Kero_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
cc = Vector((0, rim[len(rim) // 2][1] + .03, CHIN + .23 * W))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()        # faces look into the pocket
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .060              # far enough back that it never shows through the closed lip
tongue_c = np.array([0, ty, CHIN + .190 * W]); tr_ = np.array([.085 * W, .045 * W, .012 * W])
tv = []; tf = []; seg, rows_ = 14, 6
for j in range(rows_ + 1):
    ph = math.pi * j / rows_
    for i in range(seg):
        a = 2 * math.pi * i / seg; tv.append(tuple(tongue_c + tr_ * np.array([math.sin(ph) * math.cos(a), math.sin(ph) * math.sin(a), math.cos(ph)])))
for j in range(rows_):
    for i in range(seg): tf.append((j * seg + i, j * seg + (i + 1) % seg, (j + 1) * seg + (i + 1) % seg, (j + 1) * seg + i))
tongue = make_mesh('Kero_tongue', tv, tf, 'tongue')
bm = bmesh.new(); bm.from_mesh(tongue.data); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-8); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(tongue.data); bm.free()
for l in tongue.data.uv_layers.active.data: l.uv = au('tongue', .5, .5)

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
    pp = [tuple(v.co) for v in o.data.vertices]; lab = labels[o.name]; nm = o.name
    if nm == 'Kero_head': weights = [face_weights(p, l, k) for p, l, k in zip(pp, lab, vkind)]
    elif nm.startswith('Kero_eye_'): weights = [{'eye_' + nm[-1]: 1} for p in pp]
    elif nm == 'Kero_body': weights = [torso_weights(p) for p in pp]
    elif nm.startswith('Kero_arm_'): weights = [arm_weights(p, nm[-1]) for p in pp]
    elif nm.startswith('Kero_leg_'): weights = [leg_weights(p, nm[-1]) for p in pp]
    elif nm.startswith('Kero_scarf'): weights = [scarf_weights(p, l) for p, l in zip(pp, lab)]
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
    angs = np.round(np.linspace(0, LID_CLOSE, 13), 3) if bname.startswith('lidU') else np.round([-.10, -.18, LD_T, LD_T - .04], 3)
    enter(tag)
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
    leave()
    return out
def edge_report(ang_u=None):
    """the upper lid's squint edge in screen space: outer minus inner end height (W), front and the game cameras"""
    ang_u = L8['SQ'] if ang_u is None else ang_u
    nr = len(ROWS8); Xs = np.unique(np.r_[np.linspace(-1.14, 1.0, L8['NCOL']), [-.97, -1.24, .945, .975], OUTER_X, [1.44]]); out = {}
    def cam_up(yaw, pitch):
        if pitch is None: return np.array([0, 0, 1.])
        e = math.radians(pitch); y = math.radians(yaw); d = np.array([math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)])
        u = np.array([0, 0, 1.]) - d * d[2]; return u / np.linalg.norm(u)
    for o, b in lid_objects:
        if not b.startswith('lidU'): continue
        tag = b[-1]; V = np.array([list(v.co) for v in o.data.vertices]); E = rot_axis(V[::nr][:len(Xs)], np.array(P[b]), hinge(tag), ang_u)
        enter(tag); El = to_local(E, tag)
        vis = [(abs(X) < .98) and (outline_z(X, False) + .004 < El[k, 2] < outline_z(X, True) - .002) for k, X in enumerate(Xs)]
        leave()
        idx = [k for k in range(len(Xs)) if vis[k]]
        if not idx: out[o.name] = 'no visible edge'; continue
        ki, ko = idx[0], idx[-1]
        r = {'visible_X': [round(float(Xs[ki]), 2), round(float(Xs[ko]), 2)]}
        for cam, (yaw, pitch) in {'front': (0, None), 'game+45': (45, 35.5), 'game-45': (-45, 35.5)}.items():
            up = cam_up(yaw, pitch); r[cam] = round(float((E[ko] - E[ki]) @ up) / W, 4)
        out[o.name] = r
    return out
def shut_diag(ang=LID_CLOSE):
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
        egap_v = np.array([(Vector(v) - eye_tree['L'].find_nearest(Vector(v))[0]).length for v in Vs]) * 1000
        enter('L'); Vl = to_local(Vs, 'L'); srv = ns['eye_s'](1, Vl[:, 0], Vl[:, 2])[0]; leave()
        egap = egap_v[lv]; overo = (srv[lv] < .95)
        out[b] = {'n_front': int(front.sum()), 'normal_dev_deg_p50_p90_max': [round(float(np.percentile(angd[front], q)), 2) for q in (50, 90, 100)] if front.any() else None,
                  'eye_gap_mm_over_opening_p10_p50_p90': [round(float(np.percentile(egap[overo], q)), 1) for q in (10, 50, 90)] if overo.any() else None}
    return out
print('SHUT_DIAG', json.dumps(shut_diag()), 'SQUINT', json.dumps(shut_diag(L8['SQ'])), flush=True)
SWEEP = {o.name: lid_sweep(o, b) for o, b in lid_objects}
EDGE = {str(a): edge_report(a) for a in (.26, .30, .40, .488)}; print('EDGE', json.dumps(EDGE), flush=True)
print('LID_SWEEP', json.dumps(SWEEP), flush=True)
print('HIDDEN', json.dumps(hidden), flush=True)
sd = head_sdf(np.array([list(v.co) for v in tongue.data.vertices]))
hidden['Kero_tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
assert hidden['Kero_tongue@rest']['outside_count'] == 0, hidden['Kero_tongue@rest']
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'kero-toy_rig.blend'))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]]} for b in HERO],
       'triangles': total, 'lidTilt': LID_TILT, 'lidClose': LID_CLOSE, 'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'}, 'lids': lid_info,
       'lids_hidden_check': hidden, 'lid_sweep(flap, flap_on_band, hole, flap_max_mm)': SWEEP, 'happy_edge_screen': EDGE, 'lid_hinge_fit': LOG_HUG, **LOG,
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids turn about the tilted hinge (cos t, +-sin t, 0) through their bone head (HERO_MODELS lidTilt = t).',
                 'No ears / tail: ear_*, earTip_* near the dome tops and tail1-4 behind the hips, unweighted.',
                 'Weights quantized to an exact 255 sum; <= 4 influences; hands rigid to hand_*, feet to foot_*; the domes are skull (head).']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2, default=float))
print('KERO_RIG', json.dumps({'bones': len(HERO), 'triangles': total, 'hidden': hidden}), flush=True)
