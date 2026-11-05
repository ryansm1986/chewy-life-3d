"""Okami Shinju (sk-shinju-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, the game's world-axis contract.

    blender --background --factory-startup --python rig_sk-shinju-toy.py

Runs build_sk-shinju-toy.py in RIG_MODE (part labels, the rig atlas charts; the approved GLB / blend / JSON are not
touched, and at rest every bone leaves the approved look as it was, plus the director's tail fix), then adds (Kome's rig,
Pan's lid module via Sasa):
  - the armature: exactly the hero contract, identity rest orientations, heads at the joints; no ears, so ear_* / earTip_*
    sit on the crown's upper corners, unweighted (as Kero's);
  - the moving upper lids (rig_lids.Lids.upper3): rigid shells about the game's tilted lid hinge (lidTilt = her eyes'
    22.5 deg outward facing), hidden under the skin above the opening at rest, their rest edge just under the lash roll;
    the rolls (Shinju_lash_L/R) are weighted 100% to lidU_* and ride the lid's edge, so shut (+1.22) they land on the lower
    rim as the closed "U" with its wing. The lid's colour is the skin's own paint at the pose where it shows, and its
    shading normals are the skin's own at the near-shut poses (0.8-1.22);
  - the lower lids: built at the happy pose (LOW_T) hugging the eye, under the cheek at the neutral -0.10;
  - the mouth: the bill is already parted on its smile line (two pieces). The lower bill rides `jaw` rigidly; the skin
    hidden under the bill is painted as the mouth's back wall (rig atlas), the bills' hidden inner faces as the palate
    and the mouth floor, and a tongue sits on the lower bill (jaw);
  - weights (<= 4 influences, quantized to an exact 255 sum): the costume per the shared rig brief (skirt and apron on
    the hips following the thighs toward the hem, the obi / waistband / knot on the hips and spine, the collar on the
    chest riding a little with the neck), wing-hands rigid on hand_*, feet rigid on foot_*, the tail on tail1-2;
    saves sk-shinju-toy_rig.blend with only Armature modifiers.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
ns = {'__file__': str(ROOT / 'build_sk-shinju-toy.py'), '__name__': 'shinju_model', 'RIG_MODE': True}
exec(compile((ROOT / 'build_sk-shinju-toy.py').read_text(encoding='utf-8'), str(ROOT / 'build_sk-shinju-toy.py'), 'exec'), ns)
import rig_lids
from rig_lids import rot_axis
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
smooth, au, MAT, M2L, L2M = ns['smooth'], ns['au'], ns['MAT'], ns['M2L'], ns['L2M']
head_sdf, front_hit, grad_n = ns['head_sdf'], ns['front_hit'], ns['grad_n']
bill_up_sdf, bill_lo_sdf, lip_z = ns['bill_up_sdf'], ns['bill_lo_sdf'], ns['lip_z']
def sm(a, b, x): return float(smooth(a, b, x))
def env(k, d): return float(os.environ.get(k, d))
LID_TILT = env('LID_TILT', '.393')        # = the eyes' measured outward facing (22.5 deg, the model report)
LID_SQ = 0.                                # the lid is designed AT REST, its edge under the lash roll, which rides on it
LID_B, LID_ZO = env('LID_B', '.066'), env('LID_ZO', '-.20')
LID_LIFT = env('LID_LIFT', '-.0006')       # the lid's circle passes 0.6 mm under the skin at the opening's top
LOW_T = env('LOW_T', '-.28')               # the lower lid designed at the happy -0.28
LASH_EDGE_K = env('LASH_EDGE_K', '.55')    # the rest edge: this fraction of the roll's half-width under its centre line
SQ_U = env('SQ_U', '.15')                  # the game squint we design for (a low upper value, 0.1-0.2)
JAW_L = np.array([0, -.270, .170])         # the jaw hinge (head-local W): inside the head, ~0.23 W behind the bill corners
SH_N0 = env('SH_N0', '1.22'); SH_W = env('SH_W', '2.')   # the lid's shading normals: the skin field at the shut pose (game check: a range darkens the held blink)
LOG = {}
PRE = 'Shinju_'

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
head = OBJ[PRE + 'head']; head.data.calc_loop_triangles()
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ[PRE + 'eye_' + t].data.vertices], [tuple(p.vertices) for p in OBJ[PRE + 'eye_' + t].data.polygons]) for t in 'LR'}
LD = rig_lids.Lids(ns, eye_tree)
def hinge(tag): return LD.hinge(tag, LID_TILT)

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
corner_z = CHIN + .190 * W
P = {'root': (0, -.010, 0), 'hips': (0, -.020, .280), 'spine': (0, -.025, .360), 'chest': (0, -.030, .465), 'neck': (0, -.020, .585),
     'head': (0, .030, CHIN + .006),                                     # the skull base: the nod pivot at the back of the neck
     'jaw': tuple(float(c) for c in L2M(JAW_L))}                          # the hinge line inside the head, behind the bill corners
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * ns['BROW_X'], float(front_hit(s * ns['BROW_X'], ns['BROW_Z'])[0]) + .012, ns['BROW_Z'])
    P['lip_' + tag] = tuple(float(c) for c in L2M(np.array([s * .190, -.505, .190])))     # the bill corners (unweighted: the bill is rigid)
    eb = ns['joints']['ears_unweighted'][tag]
    P['ear_' + tag] = tuple(eb['base']); P['earTip_' + tag] = tuple(eb['tip'])
    ja = ns['joint_arms'][tag]
    P['upperarm_' + tag] = tuple(ja['shoulder']); P['forearm_' + tag] = tuple(ja['elbow']); P['hand_' + tag] = tuple(ja['wrist'])
    jl = ns['joint_legs'][tag]
    P['thigh_' + tag] = (s * .125, -.020, .255); P['shin_' + tag] = tuple(jl['knee']); P['foot_' + tag] = tuple(jl['ankle'])
TJ = [np.array(t) for t in ns['TAIL_JOINTS']]
for i in range(4): P['tail%d' % (i + 1)] = tuple(float(c) for c in TJ[i])

# ---------------------------------------------------------------- eyelids (Kome's)
lid_objects = []; lid_info = {}; LID_PAINT = {}
def mesh_grid(name, V, uvs, chart, nr, nc):
    """a (rows x cols) grid as quads; uvs (rows x cols x 2) chart-local"""
    Vf = V.reshape(-1, 3); fs = []
    for j in range(nr - 1):
        for i in range(nc - 1):
            q = j * nc + i; fs.append((q, q + 1, q + nc + 1, q + nc))
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(map(float, v)) for v in Vf], [], fs); me.update()
    layer = me.uv_layers.new(name='Atlas'); UVf = uvs.reshape(-1, 2)
    for p in me.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer.data[l].uv = tuple(au(chart, *UVf[me.loops[l].vertex_index]))
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); me.materials.append(MAT)
    return ob
def orient_out(ob, piv, k):
    me = ob.data; bm = bmesh.new(); bm.from_mesh(me)
    for f in bm.faces:            # outward = away from the (tilted) hinge axis
        c = np.array(f.calc_center_median()) - piv; rv = c - k * (c @ k)
        if np.dot(np.array(f.normal), rv) < 0: f.normal_flip()
    bm.to_mesh(me); bm.free()
def skin_normals(Vrest, piv, k, angs, n_a=9, end_w=8.):
    acc = np.zeros_like(Vrest)
    for a in np.linspace(angs[0], angs[1], n_a):
        Pp = rot_axis(Vrest, piv, k, a); vis = head_sdf(Pp) > -.0020
        Q = Pp.copy()
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * grad_n(Q)
        n = rot_axis(grad_n(Q), np.zeros(3), k, -a)
        wa = end_w if abs(a - angs[1]) < 1e-9 else 1.
        acc += wa * np.where(vis, 1., 1e-3)[:, None] * n
    return acc / np.linalg.norm(acc, axis=1, keepdims=True)
def cap_radii(V, piv, k, angs, tag, floor_angs, nr, nc, margin=.0008, eye_gap=.0006, keep_rows=0, overlap_from=None, overlap=.002, proud_ok=.0010):
    c = V - piv; ax = np.outer(c @ k, k); rad = c - ax; r = np.linalg.norm(rad, axis=1); u = rad / r[:, None]
    need = np.zeros(len(V)); floor = np.full(len(V), -9.)
    for a in angs:
        Va = rot_axis(V, piv, k, a); op = LD.in_opening(tag, Va) | (LD.eye_sr(tag, Va) < .985)
        sd = head_sdf(Va); ov = np.zeros(len(V), bool)
        if overlap_from is not None and a >= overlap_from:    # round 2: from mid-blink on, the lid overlaps the skin ~2 mm past the rim
            ov = (~op) & (LD.eye_sr(tag, Va) < 1.0 + overlap / EHW)      # (it may stand up to proud_ok out there, covering the rim)
            need[ov] = np.maximum(need[ov], sd[ov] - proud_ok)
        bad = (~op) & (~ov) & (sd > -margin); need[bad] = np.maximum(need[bad], sd[bad] + margin)
    for a in floor_angs:
        Va = rot_axis(V, piv, k, a); op = LD.eye_sr(tag, Va) < 1.0
        if op.any():
            idx = np.where(op)[0]; ed = LD.eye_dist(Va[idx], piv, k, tag)
            ok = np.isfinite(ed); floor[idx[ok]] = np.maximum(floor[idx[ok]], ed[ok] + eye_gap)
            if a > .55 and (~ok).any():
                mi = idx[~ok]; sdm = head_sdf(Va[mi]); floor[mi] = np.maximum(floor[mi], r[mi] - sdm + eye_gap * .5)
    sh = need.reshape(nr, nc); raw = sh.copy()
    for _ in range(10):
        p_ = np.pad(sh, 1, mode='edge'); sh = .2 * (p_[1:-1, 1:-1] + p_[:-2, 1:-1] + p_[2:, 1:-1] + p_[1:-1, :-2] + p_[1:-1, 2:])
        sh = np.maximum(sh, raw)
    if keep_rows: sh[:keep_rows] = np.minimum(sh[:keep_rows], raw[:keep_rows])
    r_new = np.maximum(r - sh.ravel(), floor)
    return piv + ax + u * r_new[:, None], {'capped': int((r_new < r - 1e-6).sum()), 'max_shrink_mm': round(float((r - r_new).max()) * 1000, 1)}
UP_ROWS = np.r_[np.linspace(0, .12, 5), np.linspace(.12, 1.55, 17)[1:]]
_psi = np.radians(np.linspace(150, 0, 120)); _th = ns['lash_th'](_psi); _ux, _uz = ns['eye_unit'](_psi)
_ke = .965 + _th * (.5 - .5 * LASH_EDGE_K)
_LX, _LZ = _ux * _ke, _uz * _ke
def lash_edge_Z(X):
    z = float(np.interp(X, _LX, _LZ))
    if X < -.80: z += 0.5 * (-.80 - X)
    if X < _LX[0]: z += 1.2 * (_LX[0] - X)
    return z
RIB_LAND = env('RIB_LAND', '-1.04')        # shut: the roll lands ~2 mm past the lower rim (the shut lid overlaps the skin)
PI_ = math.pi
def lid_pivot(tag, a=1.22):
    s = 1 if tag == 'L' else -1; k = hinge(tag); O = np.array(ns['eye_centers'][tag])
    kc = .965 + float(ns['lash_th'](np.array([PI_ / 2]))[0]) / 2
    def surf(Xe, Ze):
        x = s * EX + s * EHW * Xe; z = EZ + EHH * Ze; return np.array([x, float(front_hit(x, z)[0]), z])
    R0 = surf(0., kc); R1 = surf(0., RIB_LAND)
    u = np.array([0, 0, 1.]); v = np.cross(k, u); v /= np.linalg.norm(v)
    p0 = np.array([(R0 - O) @ v, (R0 - O) @ u]); p1 = np.array([(R1 - O) @ v, (R1 - O) @ u])
    m = (p0 + p1) / 2; c = np.linalg.norm(p1 - p0); dd = (c / 2) / math.tan(a / 2); nrm = np.array([-(p1 - p0)[1], (p1 - p0)[0]]) / c
    best = None
    for sg in (1, -1):
        cc = m + sg * dd * nrm; C3 = O + cc[0] * v + cc[1] * u
        R0r = rot_axis(R0[None], C3, k, a)[0]; err = np.linalg.norm(R0r - R1)
        if best is None or err < best[0]: best = (err, C3)
    LOG['lid_pivot_' + tag] = {'pivot': [round(float(c_), 4) for c_ in best[1]], 'fit_err_mm': round(best[0] * 1000, 2)}
    return best[1]
def lid_pivot_search(tag, C0, span=.050, step=.005):
    k = hinge(tag); u = np.array([0, 0, 1.]); v = np.cross(k, u); v /= np.linalg.norm(v)
    Vr = np.array([list(vv.co) for vv in OBJ[PRE + 'lash_' + tag].data.vertices]); X0, Z0 = LD.eye_XZ(tag, Vr)
    top = (np.abs(X0) < .45) & (Z0 > .85)
    best = None; offs = np.arange(-span, span + 1e-9, step)
    for dv in offs:
        for du in offs:
            C = C0 + dv * v + du * u
            Vs = rot_axis(Vr[top], C, k, 1.22); Zs = LD.eye_XZ(tag, Vs)[1]; land = float(np.median(Zs)); sl = head_sdf(Vs)
            if not (RIB_LAND - .12 <= land <= RIB_LAND + .12) or float(np.median(sl)) < -.003 or float(np.median(sl)) > .006: continue
            cost = 0.
            for a, wgt in ((.12, 2.), (.18, 3.), (.25, 2.), (.40, 1.2), (.60, 1.), (.85, 1.), (1.05, 1.)):
                sd = head_sdf(rot_axis(Vr[top], C, k, a))
                cost = max(cost, wgt * (max(0., float(np.percentile(sd, 95)) - .0055) + max(0., -.0025 - float(np.median(sd)))))
            if best is None or cost < best[0]: best = (cost, C, land, dv, du)
    if best is None: return C0
    LOG['lid_pivot_search_' + tag] = {'cost_mm': round(best[0] * 1000, 1), 'land_EHH': round(best[2], 3), 'shift_mm': [round(best[3] * 1000, 1), round(best[4] * 1000, 1)]}
    return best[1]
PIVOTS = {t: lid_pivot_search(t, lid_pivot(t)) for t in 'LR'}
LD.pivot = lambda tag, B, Zo: PIVOTS[tag]
print('PIVOTS', json.dumps({k_: v_ for k_, v_ in LOG.items() if k_.startswith('lid_pivot')}), flush=True)
for tag in 'LR':
    s = 1 if tag == 'L' else -1; k = hinge(tag)
    L = LD.upper3(tag, LID_TILT, LID_B, LID_ZO, u_sq=LID_SQ, sink=-LID_LIFT, zfun=lash_edge_Z, nc=25, xr=(-1.22, 1.12))
    cols = L['cols']; nc = len(cols)
    rows = [np.array([rot_axis(c_['E'][None], c_['A'], k, -LID_SQ - al)[0] for c_ in cols]) for al in UP_ROWS]
    V = np.array(rows); nr = V.shape[0]; piv = L['Pv']
    Vf, capinfo = cap_radii(V.reshape(-1, 3), piv, k, np.linspace(0, 1.22, 25), tag, np.linspace(.85, 1.22, 9), nr, nc, keep_rows=2, eye_gap=.0006, overlap_from=.45)   # (in front of the eye only late in the close: a low shut bump)
    V = Vf.reshape(nr, nc, 3)
    uv = np.stack(np.meshgrid(L['uu'], UP_ROWS / UP_ROWS[-1]), -1)
    ob = mesh_grid(PRE + 'lidU_' + tag, V, uv, 'lidU.' + tag, nr, nc); orient_out(ob, piv, k)
    N_sq = skin_normals(V.reshape(-1, 3), piv, k, (.10, .40), end_w=1.); N_sh = np.concatenate([skin_normals(V[j], piv, k, (max(float(UP_ROWS[j]), SH_N0), 1.22), n_a=5, end_w=SH_W)
                           for j in range(nr)])   # round 2: per row, the skin field over the poses where that row shows (it emerges at the
                                                  # opening's top at lidU = its angle above the edge and stays until shut), shut weighted most
    wsh = np.repeat(smooth(.04, .12, UP_ROWS)[:, None], nc, 1).reshape(-1, 1)          # (only the edge rows, seen in a squint, keep the squint normals)
    NRM = N_sq * (1 - wsh) + N_sh * wsh; NRM /= np.linalg.norm(NRM, axis=1, keepdims=True)
    ob.data.normals_split_custom_set([tuple(NRM[ob.data.loops[l].vertex_index]) for l in range(len(ob.data.loops))])
    lid_objects.append((ob, 'lidU_' + tag)); P['lidU_' + tag] = tuple(float(c) for c in piv)
    LID_PAINT['lidU.' + tag] = dict(V=V, rows=UP_ROWS, uu=L['uu'], Xs=L['Xs'], piv=piv, k=k, tag=tag)
    sc_ = LD.score2(dict(L, V=V)); sc_.pop('worst(a, colX, row, mm, X, Z)', None)
    lid_info[PRE + 'lidU_' + tag] = {'pivot': [round(float(c), 5) for c in piv], 'cap': capinfo, **sc_}
    Lo = LD.lower(tag, LID_TILT, dz=env('LOW_DZ', '2.0'), arch_c=env('ARCH_C', '.62'), arch_e=env('ARCH_E', '.30'), target=LOW_T)
    Vl = np.transpose(Lo['V'], (1, 0, 2)).copy(); nrl, ncl = Vl.shape[0], Vl.shape[1]; pivl = Lo['Pv']
    Vlf, capl = cap_radii(Vl.reshape(-1, 3), pivl, k, (.04, 0., -.05, -.08, -.10, -.12, -.16, -.20, -.24, -.28, -.32, -.36), tag, (-.30, -.24, -.20), nrl, ncl, margin=.0026)
    Vl = Vlf.reshape(nrl, ncl, 3)
    uvl = np.stack(np.meshgrid((Lo['Xs'] - Lo['Xs'][0]) / (Lo['Xs'][-1] - Lo['Xs'][0]), np.linspace(0, 1, nrl)), -1)
    obl = mesh_grid(PRE + 'lidD_' + tag, Vl, uvl, 'lidD.' + tag, nrl, ncl); orient_out(obl, pivl, k)
    NRl = skin_normals(Vl.reshape(-1, 3), pivl, k, (-.10, LOW_T))
    obl.data.normals_split_custom_set([tuple(NRl[obl.data.loops[l].vertex_index]) for l in range(len(obl.data.loops))])
    lid_objects.append((obl, 'lidD_' + tag)); P['lidD_' + tag] = tuple(float(c) for c in pivl)
    LID_PAINT['lidD.' + tag] = dict(V=Vl, tag=tag, piv=pivl, k=k)
    lid_info[PRE + 'lidD_' + tag] = {'pivot': [round(float(c), 5) for c in pivl], 'cap': capl}
print('LIDS', json.dumps(lid_info, default=float), flush=True)

LASH_SWEEP = {}
for tag in 'LR':
    Vr = np.array([list(v.co) for v in OBJ[PRE + 'lash_' + tag].data.vertices]); piv = np.array(P['lidU_' + tag]); k = hinge(tag)
    out = {}
    for a in (0., .15, .488, .8, 1.0, 1.22):
        Va = rot_axis(Vr, piv, k, a); sd = head_sdf(Va); X_, Z_ = LD.eye_XZ(tag, Va)
        inside = LD.eye_sr(tag, Va) < 1.0
        out[a] = {'proud_max_mm': round(float(np.where(inside, -9, sd).max()) * 1000, 1), 'buried_frac': round(float((sd < -.0015).mean()), 3),
                  'Z_range_EHH': [round(float(Z_.min()), 2), round(float(Z_.max()), 2)]}
    LASH_SWEEP[tag] = out
print('LASH_SWEEP', json.dumps(LASH_SWEEP), flush=True)

# ---------------------------------------------------------------- lid paint: the skin's own paint at the pose where it shows
def grid_point(V, rows_v, U, Vv):
    nr, nc, _ = V.shape; ci = np.clip(U * (nc - 1), 0, nc - 1.0001); i0 = ci.astype(int); fa = (ci - i0)[..., None]
    jj = np.clip(np.searchsorted(rows_v, Vv, side='right') - 1, 0, nr - 2); fb = ((Vv - rows_v[jj]) / (rows_v[jj + 1] - rows_v[jj]))[..., None]
    return V[jj, i0] * (1 - fa) * (1 - fb) + V[jj, i0 + 1] * fa * (1 - fb) + V[jj + 1, i0] * (1 - fa) * fb + V[jj + 1, i0 + 1] * fa * fb
def skin_paint_at(P_):
    Q = P_.reshape(-1, 3).copy()
    for _ in range(4): Q = Q - head_sdf(Q)[:, None] * grad_n(Q)
    return ns['paint_head_P'](Q).reshape(P_.shape)
RIB_T = env('RIB_T', '.0110'); RIB_DIAG = {}
def paint_lids():
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    w_, h_ = img.size; px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    rgb, mix = ns['rgb'], ns['mix']
    for chart, info in LID_PAINT.items():
        x0, y0, w, h = ns['CHARTS'][chart]
        U, Vv = np.meshgrid(np.clip((np.arange(w) - 6) / (w - 12), 0, 1), np.clip((np.arange(h) - 6) / (h - 12), 0, 1))
        if chart.startswith('lidU'):
            Pt = grid_point(info['V'], info['rows'] / info['rows'][-1], U, Vv)
            rows_a = Vv * info['rows'][-1]
            C_sh = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], 1.22).reshape(Pt.shape))
            C_sq = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], .25).reshape(Pt.shape))
            C = mix(C_sq, C_sh, smooth(.04, .12, rows_a))                  # round 2: the skin's paint at the shut pose (blush on), per side
            V = info['V']; nr, nc, _ = V.shape; vrow = info['rows'] / info['rows'][-1]
            arc = np.array([[np.linalg.norm(V[j, i] - V[0, i]) for i in range(nc)] for j in range(nr)])
            ci = np.clip(U * (nc - 1), 0, nc - 1.0001); i0 = ci.astype(int); fa = ci - i0
            jj = np.clip(np.searchsorted(vrow, Vv, side='right') - 1, 0, nr - 2); fb = (Vv - vrow[jj]) / (vrow[jj + 1] - vrow[jj])
            A_ = (arc[jj, i0] * (1 - fa) * (1 - fb) + arc[jj, i0 + 1] * fa * (1 - fb) + arc[jj + 1, i0] * (1 - fa) * fb + arc[jj + 1, i0 + 1] * fa * fb)
            C = mix(C, rgb('lash'), 1 - smooth(.0070, .0090, A_))          # round 2: a thicker lid lash band (the shut line reads at the game camera)
            tag = info['tag']; Xc = info['Xs']
            Vs = rot_axis(V.reshape(-1, 3), info['piv'], info['k'], 1.22).reshape(nr, nc, 3); em = np.full(nc, np.nan)
            for i in range(nc):
                sr = LD.eye_sr(tag, Vs[:, i]) - 1.0; Zr = LD.eye_XZ(tag, Vs[:, i])[1]
                cr = np.where((sr[:-1] > 0) & (sr[1:] <= 0) & (Zr[:-1] < 0))[0]
                if len(cr):
                    j = int(cr[0]); f_ = float(np.clip(sr[j] / max(sr[j] - sr[j + 1], 1e-9), 0, 1)); em[i] = arc[j, i] + (arc[j + 1, i] - arc[j, i]) * f_
            ok = np.isfinite(em) & (np.abs(Xc) < 1.02)
            RIB_DIAG[chart] = {'cols': int(ok.sum())}
            if ok.sum() >= 4:
                cf = np.polyfit(Xc[ok], em[ok], 2); emf = np.polyval(cf, Xc)
                inside = (Xc >= Xc[ok].min() - 1e-6) & (Xc <= Xc[ok].max() + 1e-6)
                e0 = np.interp(ci, np.arange(nc), emf); ins = np.interp(ci, np.arange(nc), inside.astype(float)) > .5
                Xi = np.interp(ci, np.arange(nc), Xc)
                taper = np.clip((Xi + 1.0) / .35, 0, 1) ** .7; flick = .0045 * smooth(.45, .98, Xi) ** 2
                top = e0 + (RIB_T * taper + flick)
                near = 1 - smooth(.0085, .0130, e0)
                rib = smooth(e0 - .0016, e0 - .0006, A_) * (1 - smooth(top - .0008, top + .0008, A_)) * ins * near
                C = mix(C, rgb('lash'), rib)
        else:
            Vl_ = info['V']; Pt = grid_point(Vl_, np.linspace(0, 1, Vl_.shape[0]), U, Vv)
            C = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], -.06).reshape(Pt.shape))
            C = mix(C, rgb('#e2c4a8'), .45 * np.exp(-((Vv - .03) / .03) ** 2))
            C = mix(C, rgb('#b88e76'), .30 * (1 - smooth(.0, .03, Vv)))
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    # the cavity and tongue charts
    for chart, (c0, c1) in (('cavity', ('#5a1e22', '#3e1418')), ('tongue', ('#e88a96', '#f2a2ac'))):
        x0, y0, w, h = ns['CHARTS'][chart]; px[y0:y0 + h, x0:x0 + w, :3] = ns['mix'](ns['rgb'](c0), ns['rgb'](c1), .5)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'sk-shinju-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()

# ---------------------------------------------------------------- weights
ARMS = {tag: ns['joint_arms'][tag] for tag in 'LR'}
ARM_D = {tag: (np.array(ARMS[tag]['wrist']) - np.array(ARMS[tag]['shoulder'])) / np.linalg.norm(np.array(ARMS[tag]['wrist']) - np.array(ARMS[tag]['shoulder'])) for tag in 'LR'}
ARM_LEN = {tag: float(np.linalg.norm(np.array(ARMS[tag]['wrist']) - np.array(ARMS[tag]['shoulder']))) for tag in 'LR'}
def face_weights(p):
    """the skull and the face on the head; the hidden underside at the back rides a little with the neck"""
    q = M2L(np.array(p)); zl, yl = q[2], q[1]
    neck = sm(.06, -.01, zl) * sm(-.05, .20, yl) * .5
    return {'neck': neck, 'head': 1 - neck}
TV, TW = ns['TAIL_V_AX'], ns['TAIL_W_AX']; TC = ns['TAIL_C']
def tail_weights(p):
    """the fan: its base (set into the skirt) on tail1 with a little of the hips, the upper half blending onto tail2"""
    c = float((np.asarray(p) - TC) @ TV)                  # up the fan (m), 0 at its middle
    t2 = sm(-.010, .045, c); root = 1 - sm(-.060, -.030, c)
    return {'hips': .5 * root, 'tail1': (1 - .5 * root) * (1 - t2), 'tail2': (1 - .5 * root) * t2}
from mathutils.kdtree import KDTree
FLICK_KD = {}
for _t, _pts in ns['LASH_FLICK_PTS'].items():
    _kd = KDTree(len(_pts))
    for _i, (_p, _) in enumerate(_pts): _kd.insert(Vector(_p), _i)
    _kd.balance(); FLICK_KD[_t] = (_kd, [tt for _, tt in _pts])
FLICK_HEAD = env('FLICK_HEAD', '.5')       # the share of head on each flick past its root
def flick_t(side, p):
    kd, ts = FLICK_KD[side]; co, i, d = kd.find(Vector(p))
    return ts[i] if d < 1e-5 else None
def apron_th(z): return .38 * float(np.clip((.370 - z) / .207, 0, 1)) ** .80
def thigh_split(x, th, width=.10):
    wl = th * sm(-width, width, x); return wl, th - wl
def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab.endswith('.L'): side = 'L'
    if lab.endswith('.R'): side = 'R'
    if lab.startswith('lash_line.'):                                           # the lash rides the upper lid's edge
        t = flick_t(side, p)                                                    # the flicks blend from lidU at the root to head at the tip,
        if t is None: return {'lidU_' + side: 1.}                               # so shut they stay on the face (no float past the cheek)
        f = FLICK_HEAD * sm(.0, .30, t); return {'lidU_' + side: 1 - f, 'head': f}   # one share along the flick: it turns as a whole (no stretch)
    if lab == 'bill_upper': return {'head': 1.}
    if lab == 'bill_lower': return {'jaw': 1.}                                  # rigid on the jaw
    if lab == 'kimono_bell':
        if z < .360:                                                           # the skirt: each side follows its thigh toward the hem
            th = .80 * float(np.clip((.300 - z) / .180, 0, 1)) ** .60
            # under the apron the skirt moves with the apron (so neither pokes through the other), below its hem as the skirt
            m = (1 - sm(.170, .235, abs(x))) * sm(.150, .180, z) * sm(-.05, -.12, y)
            th = m * apron_th(z) + (1 - m) * th
            wl, wr = thigh_split(x, th, .10 + .02 * m); return {'hips': 1 - th, 'thigh_L': wl, 'thigh_R': wr}
        hips = 1 - sm(.360, .430, z); chest = sm(.450, .520, z); top = sm(.575, .625, z)
        arm = .25 * sm(.11, .15, abs(x)) * sm(.48, .54, z) * (1 - top)          # the armhole rides a little with the sleeve
        return {'hips': hips * (1 - top), 'spine': (1 - hips) * (1 - chest) * (1 - top), 'chest': (1 - hips) * chest * (1 - top) * (1 - arm),
                'upperarm_' + side: (1 - hips) * chest * (1 - top) * arm, 'neck': .70 * top, 'head': .30 * top}
    if lab == 'collar':                                                        # chest, riding a little with the neck toward the top
        r = sm(.530, .600, z); return {'chest': .80 - .30 * r, 'neck': .20 + .22 * r, 'head': .08 * r}
    if lab in ('obi_band', 'apron_waistband', 'apron_knot'):
        sp = sm(.370, .480, z); return {'hips': 1 - sp, 'spine': sp}
    if lab == 'apron_panel':                                                   # hips, following the thighs gently toward its hem
        th = apron_th(z); wl, wr = thigh_split(x, th, .12); return {'hips': 1 - th, 'thigh_L': wl, 'thigh_R': wr}
    if lab.startswith('sleeve.'):                                              # the sleeve on the upper arm, the cap blending to the chest
        t = float((np.array(p) - np.array(ARMS[side]['shoulder'])) @ ARM_D[side])
        chest = .45 * (1 - sm(-.055, .035, t)); return {'chest': chest, 'upperarm_' + side: 1 - chest}
    if lab.startswith('arm.'):
        t = float((np.array(p) - np.array(ARMS[side]['shoulder'])) @ ARM_D[side]); Lw = ARM_LEN[side]
        fore = sm(.42 * Lw, .62 * Lw, t); hand = sm(.88 * Lw, 1.0 * Lw, t); chest = .25 * (1 - sm(-.04, .03, t))
        return {'chest': chest, 'upperarm_' + side: (1 - chest) * (1 - fore), 'forearm_' + side: (1 - chest) * fore * (1 - hand),
                'hand_' + side: (1 - chest) * fore * hand}
    if lab.startswith('hand.'): return {'hand_' + side: 1.}                     # the wing-hand: rigid
    if lab.startswith('foot.'): return {'foot_' + side: 1.}
    if lab.startswith('leg.'):
        hips = sm(.255, .290, z); shin = 1 - sm(.140, .200, z); foot = 1 - sm(.058, .088, z)
        return {'hips': hips, 'thigh_' + side: (1 - hips) * (1 - shin), 'shin_' + side: (1 - hips) * shin * (1 - foot), 'foot_' + side: (1 - hips) * shin * foot}
    if lab == 'tail': return tail_weights(p)
    raise KeyError(lab)

# ---------------------------------------------------------------- the armature
HERO = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'jaw']
for tag in 'LR': HERO += [k_ + '_' + tag for k_ in ('eye', 'lidU', 'lidD', 'brow', 'lip', 'ear', 'earTip', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot')]
HERO += ['tail1', 'tail2', 'tail3', 'tail4']
PARENT = {'root': None, 'hips': 'root', 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck', 'jaw': 'head',
          'tail1': 'hips', 'tail2': 'tail1', 'tail3': 'tail2', 'tail4': 'tail3'}
for tag in 'LR':
    PARENT.update({f'eye_{tag}': 'head', f'lidU_{tag}': 'head', f'lidD_{tag}': 'head', f'brow_{tag}': 'head', f'lip_{tag}': 'head',
                   f'ear_{tag}': 'head', f'earTip_{tag}': f'ear_{tag}', f'upperarm_{tag}': 'chest', f'forearm_{tag}': f'upperarm_{tag}',
                   f'hand_{tag}': f'forearm_{tag}', f'thigh_{tag}': 'hips', f'shin_{tag}': f'thigh_{tag}', f'foot_{tag}': f'shin_{tag}'})
assert len(HERO) == 37 and set(HERO) == set(P), set(HERO) ^ set(P)
adata = bpy.data.armatures.new('Shinju_game_skeleton'); arm = bpy.data.objects.new('Shinju_Rig', adata); bpy.context.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name in HERO:
    b = adata.edit_bones.new(name); b.head = P[name]; b.tail = Vector(P[name]) + Vector((0, .04, 0)); b.roll = 0
    if PARENT[name]: b.parent = adata.edit_bones[PARENT[name]]
    b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for b in arm.pose.bones: b.rotation_mode = 'YZX'          # = three.js 'XYZ' order under the game axis mapping
arm.show_in_front = True

# ---------------------------------------------------------------- the tongue: a soft pink bean on the lower bill (jaw)
def make_mesh(name, coords, polys, chart):
    me_ = bpy.data.meshes.new(name); me_.from_pydata(coords, [], polys); me_.update(); layer_ = me_.uv_layers.new(name='Atlas')
    for p in me_.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer_.data[l].uv = tuple(au(chart, .5, .5))
    ob_ = bpy.data.objects.new(name, me_); bpy.context.collection.objects.link(ob_); me_.materials.append(MAT); return ob_
TC_L = np.array([0, -.455, float(lip_z(0., -.455)) + .006]); TR_L = np.array([.070, .085, .016])   # head-local W
tv = []; tf = []; nseg, nrng = 16, 8
for j in range(nrng + 1):
    ph = math.pi * j / nrng
    for i in range(nseg):
        a = 2 * math.pi * i / nseg
        q = TC_L + TR_L * np.array([math.sin(ph) * math.cos(a), math.sin(ph) * math.sin(a), -math.cos(ph)])
        tv.append(tuple(float(c) for c in L2M(q)))
for j in range(nrng):
    for i in range(nseg): tf.append((j * nseg + i, j * nseg + (i + 1) % nseg, (j + 1) * nseg + (i + 1) % nseg, (j + 1) * nseg + i))
tongue = make_mesh(PRE + 'tongue', tv, tf, 'tongue')
bm = bmesh.new(); bm.from_mesh(tongue.data); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-9); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(tongue.data); bm.free()

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
    if o.name == PRE + 'head': weights = [face_weights(p) for p in pp]
    elif o.name.startswith(PRE + 'eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    else: weights = [body_weights(p, l) for p, l in zip(pp, lab)]
    bind(o, weights); objects.append(o)
bind(tongue, [{'jaw': 1} for v in tongue.data.vertices]); objects.append(tongue)
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
        Vr = rot_axis(V, piv, hinge(bname[-1]), ang); sd = head_sdf(Vr)
        op = LD.in_opening(bname[-1], Vr)
        hidden[f'{o.name}@{ang}'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum()),
                                    'over_opening_count': int(op.sum())}
# the tongue hidden at rest (inside the bills / the head), and how the open lower bill sits (jaw 0.42)
TVv = np.array([list(v.co) for v in tongue.data.vertices])
sd_t = np.minimum(np.minimum(bill_up_sdf(TVv), bill_lo_sdf(TVv)), head_sdf(TVv))
hidden['tongue@rest'] = {'max_sdf_mm': round(float(sd_t.max()) * 1000, 2), 'outside_count': int((sd_t > -.0003).sum())}
BLv = np.array([list(v.co) for v in OBJ[PRE + 'bill_lower'].data.vertices]); jp = np.array(P['jaw'])
for a in (.15, .42):
    Va = rot_axis(BLv, jp, np.array([1., 0, 0]), a)
    hidden[f'bill_lower@jaw{a}'] = {'lowest_z_m': round(float(Va[:, 2].min()), 4), 'tip_drop_mm': round(float((BLv[:, 2].min() - Va[:, 2].min()) * 1000), 1)}
def cam_up(yaw_deg, elev_deg):
    e = math.radians(elev_deg); y = math.radians(yaw_deg)
    d = np.array([math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)])
    right = np.cross(-d, [0, 0, 1.]); right /= np.linalg.norm(right); up = np.cross(right, -d); return up
def edge_screen(sq):
    out = {}
    for o, bname in lid_objects:
        if not bname.startswith('lidU'): continue
        tag = bname[-1]; s_ = 1 if tag == 'L' else -1; info = LID_PAINT['lidU.' + tag]
        E = rot_axis(info['V'][0], np.array(P[bname]), hinge(tag), sq); vis = LD.eye_sr(tag, E) < .97
        Ev = E[vis]
        if len(Ev) < 3: out[tag] = 'edge not over the opening'; continue
        Ev = Ev[np.argsort(s_ * Ev[:, 0])]
        res = {}
        for nm, (yaw, el) in (('front', (0, 0)), ('game0', (0, 35.5)), ('game+45', (45, 35.5)), ('game-45', (-45, 35.5))):
            h = Ev @ cam_up(yaw, el) / W
            res[nm] = {'outer_minus_inner_W': round(float(h[-1] - h[0]), 4), 'mid_minus_inner_W': round(float(h[len(h) // 2] - h[0]), 4)}
        X_, Z_ = LD.eye_XZ(tag, Ev); res['covers_mid_frac'] = round(float((1 - Z_[len(Z_) // 2]) / 2), 3)
        out[tag] = res
    return out
EDGES = {sq_: edge_screen(sq_) for sq_ in (.10, SQ_U, .20, .488)}
print('EDGE_SCREEN', json.dumps(EDGES), flush=True)
print('HIDDEN', json.dumps(hidden), flush=True)
def proud_sweep(o, bname):
    tag = bname[-1]; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices]); out = {}
    angs = np.round(np.linspace(0, 1.22, 13), 3) if bname.startswith('lidU') else np.round([0., -.10, -.18, -.24, -.28, -.34], 3)
    for a in angs:
        Va = rot_axis(V, piv, hinge(tag), a); op = LD.in_opening(tag, Va) | (LD.eye_sr(tag, Va) < .985); sd = np.where(op, -9., head_sdf(Va))
        bad = sd > .0005; out[float(a)] = [int(bad.sum()), round(float(sd.max()) * 1000, 1)]
    return out
PROUD = {o.name: proud_sweep(o, b) for o, b in lid_objects}
print('PROUD', json.dumps(PROUD), flush=True)
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'sk-shinju-toy_rig.blend'))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]]} for b in HERO],
       'triangles': total, 'lidTilt': LID_TILT, 'squint_designed_for': [SQ_U, LOW_T],
       'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'}, 'lids': lid_info, 'lids_hidden_check': hidden,
       'lash_sweep': LASH_SWEEP, 'shut_U_band': RIB_DIAG, 'happy_edge_screen': EDGES, 'proud_outside_opening(count, max_mm)': PROUD, **LOG,
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids turn about the tilted hinge (cos t, +-sin t, 0) through their bone head (HERO_MODELS lidTilt = t).',
                 'The lash rolls (Shinju_lash_L/R) are weighted 100% to lidU_L/R and ride the upper lid, whose rest edge runs just under the roll.',
                 'Mouth: Shinju_bill_lower 100% jaw (rigid), the tongue on jaw; the skin under the bill is the painted back wall.',
                 'No ears: ear_* / earTip_* unweighted (as Kero). lip_* sit at the bill corners, unweighted (the bill is rigid).',
                 'Skirt: hips, each side following its thigh toward the hem (0.80 at the hem). Apron: hips, the thighs up to 0.38 at its hem.',
                 'Obi, waistband and knot on the hips and spine. Collar on the chest riding with the neck toward the top. Wing-hands rigid on hand_*.',
                 'Tail (a fan): its base on tail1 with half the hips at the very root, the upper half blending onto tail2; tail3-4 unweighted.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2, default=float))
print('SHINJU_RIG', json.dumps({'bones': len(HERO), 'triangles': total}), flush=True)
