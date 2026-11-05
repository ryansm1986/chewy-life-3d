"""Ochiyo (ak-ochiyo-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, the game's world-axis contract.

    blender --background --factory-startup --python rig_ak-ochiyo-toy.py

Runs build_ak-ochiyo-toy.py in RIG_MODE (part labels, the rig atlas charts; the approved GLB / blend / JSON are not touched;
the director's rig-round fix, denser ear rings and rows, is in the build), then adds (Kome's rig, Pan's lid module):
  - the armature: exactly the hero contract, identity rest orientations, heads at the joints;
  - the moving upper lids (rig_lids.Lids.upper3): rigid shells about the game's tilted lid hinge (lidTilt = her eyes'
    29.5 deg outward facing), hidden under the skin above the opening at rest, their rest edge just under the lash ribbon;
    the ribbons (Ochiyo_lash_L/R) are weighted 100% to lidU_* and ride the lid's edge, so shut (+1.22) they land on the
    lower rim as the closed "U" with its wing. The lid's colour is the skin's own paint (the patch on her right) at the pose
    where it shows, and its shading normals are the skin's own at the near-shut poses (0.8-1.22);
  - the lower lids: built at the happy pose (LOW_T) hugging the eye, under the cheek at the neutral -0.10;
  - the mouth: the skin parted along the painted "w" between sealed corners, a closed cavity and a tongue;
  - weights (<= 4 influences, quantized to an exact 255 sum): the costume per the shared rig brief (skirt and apron panel on
    the hips following the thighs toward the hem with the same field, the bib and straps on the torso, the obi knot rigid, the collar on the
    chest riding a little with the neck), ears with a spring root, the tail along tail1-4; saves ak-ochiyo-toy_rig.blend
    with only Armature modifiers.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
ns = {'__file__': str(ROOT / 'build_ak-ochiyo-toy.py'), '__name__': 'ochiyo_model', 'RIG_MODE': True}
exec(compile((ROOT / 'build_ak-ochiyo-toy.py').read_text(encoding='utf-8'), str(ROOT / 'build_ak-ochiyo-toy.py'), 'exec'), ns)
import rig_lids
from rig_lids import rot_axis
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MC, MHW = ns['MC'], ns['MHW']
smooth, au, MAT, M2L = ns['smooth'], ns['au'], ns['MAT'], ns['M2L']
head_sdf, front_hit, grad_n = ns['head_sdf'], ns['front_hit'], ns['grad_n']
NOSE_TIP_L = ns['NOSE_TIP_L']
def sm(a, b, x): return float(smooth(a, b, x))
def env(k, d): return float(os.environ.get(k, d))
LID_TILT = env('LID_TILT', '.515')        # = the eyes' measured outward facing (29.5 deg, the model report)
LID_SQ = 0.                                # the lid is designed AT REST, its edge under the lash ribbon, which rides on it
LID_B, LID_ZO = env('LID_B', '.066'), env('LID_ZO', '-.20')   # the lever: shut (1.22) brings the lash ribbon to the lower rim
LID_LIFT = env('LID_LIFT', '-.0006')       # the lid's circle passes 0.6 mm under the skin at the opening's top
LOW_T = env('LOW_T', '-.30')               # the lower lid designed at the happy -0.30
LASH_EDGE_K = env('LASH_EDGE_K', '.55')    # the rest edge: this fraction of the ribbon's half-width under its centre line
SQ_U = env('SQ_U', '.20')                  # the game squint we design for (the director: a low upper value, 0.12-0.2)
LOG = {}

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
head = OBJ['Ochiyo_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Ochiyo_eye_' + t].data.vertices], [tuple(p.vertices) for p in OBJ['Ochiyo_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
LD = rig_lids.Lids(ns, eye_tree)
def hinge(tag): return LD.hinge(tag, LID_TILT)

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
mouth_y = float(front_hit(0., CHIN + .190 * W)[0]); corner_z = CHIN + .199 * W
P = {'root': (0, -.004, 0), 'hips': (0, .004, .310), 'spine': (0, .006, .375), 'chest': (0, .010, .445), 'neck': (0, .015, .522),
     'head': (0, HY + .018, CHIN + .006),                                     # the skull base: the nod pivot at the back of the neck
     'jaw': (0, mouth_y + .22 * W, corner_z)}                            # the hinge line inside the head, 0.22 W behind the mouth
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * ns['BROW_X'], float(front_hit(s * ns['BROW_X'], ns['BROW_Z'])[0]) + .012, ns['BROW_Z'])
    P['lip_' + tag] = (s * MHW, float(front_hit(s * MHW, corner_z)[0]) + .002, corner_z)
    E = ns['ear_info'][s]
    P['ear_' + tag] = tuple(float(c) for c in E['S'])
    P['earTip_' + tag] = tuple(float(c) for c in E['S'] + E['w'] * .13 * W)
    ja = ns['joint_arms'][tag]
    P['upperarm_' + tag] = tuple(ja['shoulder']); P['forearm_' + tag] = tuple(ja['elbow']); P['hand_' + tag] = tuple(ja['wrist'])
    jl = ns['joint_legs'][tag]
    P['thigh_' + tag] = (s * .108, .003, .288); P['shin_' + tag] = tuple(jl['knee']); P['foot_' + tag] = tuple(jl['ankle'])
TJ = [np.array(t) for t in ns['TAIL_JOINTS']]
for i in range(4): P['tail%d' % (i + 1)] = tuple(float(c) for c in TJ[i])

# ---------------------------------------------------------------- eyelids
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
    """shading normals: the head ball's own normal under each vertex, averaged in the lid's frame over the given pose range
    (the near-shut poses for the upper lid, the squint for the lower lid) where the vertex shows; so the lid shades exactly
    like the skin round it mid-blink (no pale disc)"""
    acc = np.zeros_like(Vrest)
    for a in np.linspace(angs[0], angs[1], n_a):
        Pp = rot_axis(Vrest, piv, k, a); vis = head_sdf(Pp) > -.0020
        Q = Pp.copy()
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * grad_n(Q)
        n = rot_axis(grad_n(Q), np.zeros(3), k, -a)
        wa = end_w if abs(a - angs[1]) < 1e-9 else 1.            # the end pose (shut / the squint) weighted most
        acc += wa * np.where(vis, 1., 1e-3)[:, None] * n
    return acc / np.linalg.norm(acc, axis=1, keepdims=True)
def cap_radii(V, piv, k, angs, tag, floor_angs, nr, nc, margin=.0008, eye_gap=.0006, keep_rows=0):
    """shrink radii (about the hinge) of the vertices that would stand out of the skin outside the opening at any test
    angle, never into the eye at the angles where they are over it; smoothed over the grid. The shell stays rigid."""
    c = V - piv; ax = np.outer(c @ k, k); rad = c - ax; r = np.linalg.norm(rad, axis=1); u = rad / r[:, None]
    need = np.zeros(len(V)); floor = np.full(len(V), -9.)
    for a in angs:
        Va = rot_axis(V, piv, k, a); op = LD.in_opening(tag, Va) | (LD.eye_sr(tag, Va) < .985)
        sd = head_sdf(Va); bad = (~op) & (sd > -margin); need[bad] = np.maximum(need[bad], sd[bad] + margin)
    for a in floor_angs:
        Va = rot_axis(V, piv, k, a); op = LD.eye_sr(tag, Va) < 1.0
        if op.any():
            idx = np.where(op)[0]; ed = LD.eye_dist(Va[idx], piv, k, tag)
            ok = np.isfinite(ed); floor[idx[ok]] = np.maximum(floor[idx[ok]], ed[ok] + eye_gap)
            if a > .55 and (~ok).any():                    # the ray missed the lens (near the rim): keep in front of the face surface
                mi = idx[~ok]; sdm = head_sdf(Va[mi]); floor[mi] = np.maximum(floor[mi], r[mi] - sdm + eye_gap * .5)
    sh = need.reshape(nr, nc); raw = sh.copy()
    for _ in range(10):
        p_ = np.pad(sh, 1, mode='edge'); sh = .2 * (p_[1:-1, 1:-1] + p_[:-2, 1:-1] + p_[2:, 1:-1] + p_[1:-1, :-2] + p_[1:-1, 2:])
        sh = np.maximum(sh, raw)
    if keep_rows: sh[:keep_rows] = np.minimum(sh[:keep_rows], raw[:keep_rows])
    r_new = np.maximum(r - sh.ravel(), floor)
    return piv + ax + u * r_new[:, None], {'capped': int((r_new < r - 1e-6).sum()), 'max_shrink_mm': round(float((r - r_new).max()) * 1000, 1)}
UP_ROWS = np.r_[np.linspace(0, .12, 5), np.linspace(.12, 1.55, 17)[1:]]       # body angles above the edge (fine at the edge)
# the ribbon's centre line and half-width in eye units (the model's LASH_PSI / lash_th / k_in = .965), over the top only
_psi = np.radians(np.linspace(158, 0, 120)); _th = ns['lash_th'](_psi); _ux, _uz = ns['eye_unit'](_psi)
_ke = .965 + _th * (.5 - .5 * LASH_EDGE_K)
_LX, _LZ = _ux * _ke, _uz * _ke
def lash_edge_Z(X):
    """the upper lid's rest edge (EHH): under the lash ribbon's centre line by LASH_EDGE_K of its half-width, so the ribbon
    (on lidU) sits on the lid's edge in every pose; past the ribbon's ends it carries on level"""
    z = float(np.interp(X, _LX, _LZ))
    if X < -.80: z += 0.5 * (-.80 - X)                 # toward the ribbon's thin inner tip: tuck up a little under the skin
    if X < _LX[0]: z += 1.2 * (_LX[0] - X)            # past the ribbon's inner end: just above the corner (so it still sweeps over it when shut)
    return z
RIB_LAND = env('RIB_LAND', '-1.0')          # where the ribbon's top-centre lands when shut (EHH; the lower rim = -1)
def lid_pivot(tag, a=1.22):
    """the hinge point (any point on the tilted axis): the centre of the circle about the hinge that carries the lash ribbon's
    top-centre (on the skin above the eye) exactly onto the lower rim (RIB_LAND) in `a` radians, so the ribbon and the lid's
    edge sweep at the face's own distance from the hinge (no floating off the skin)"""
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
    LOG['lid_pivot_' + tag] = {'pivot': [round(float(c_), 4) for c_ in best[1]], 'fit_err_mm': round(best[0] * 1000, 2),
                               'radius_mm': round(float(np.linalg.norm((R0 - best[1]) - k * ((R0 - best[1]) @ k))) * 1000, 1)}
    return best[1]
PI_ = math.pi
def lid_pivot_search(tag, C0, span=.050, step=.005):
    """refine the hinge point in the plane square to the hinge: the ribbon (which rides lidU) should stay ON the face through
    the sweep (neither lifting off nor sinking in; the held squint 0.12-0.25 weighted most), and when shut (1.22) its
    top-centre must lie on the lower rim's skin"""
    k = hinge(tag); u = np.array([0, 0, 1.]); v = np.cross(k, u); v /= np.linalg.norm(v)
    Vr = np.array([list(vv.co) for vv in OBJ['Ochiyo_lash_' + tag].data.vertices]); X0, Z0 = LD.eye_XZ(tag, Vr)
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
    # ---- upper
    L = LD.upper3(tag, LID_TILT, LID_B, LID_ZO, u_sq=LID_SQ, sink=-LID_LIFT, zfun=lash_edge_Z, nc=25, xr=(-1.22, 1.12))   # (wider toward the nose: the tilted hinge moves the lid outward as it sweeps)
    cols = L['cols']; nc = len(cols)
    rows = [np.array([rot_axis(c_['E'][None], c_['A'], k, -LID_SQ - al)[0] for c_ in cols]) for al in UP_ROWS]
    V = np.array(rows); nr = V.shape[0]; piv = L['Pv']
    Vf, capinfo = cap_radii(V.reshape(-1, 3), piv, k, np.linspace(0, 1.22, 25), tag, np.linspace(0, 1.22, 25), nr, nc, keep_rows=2, eye_gap=.0006)
    V = Vf.reshape(nr, nc, 3)
    uv = np.stack(np.meshgrid(L['uu'], UP_ROWS / UP_ROWS[-1]), -1)
    ob = mesh_grid('Ochiyo_lidU_' + tag, V, uv, 'lidU.' + tag, nr, nc); orient_out(ob, piv, k)
    N_sq = skin_normals(V.reshape(-1, 3), piv, k, (.10, .40), end_w=1.); N_sh = skin_normals(V.reshape(-1, 3), piv, k, (.80, 1.22))
    wsh = np.repeat(smooth(.22, .55, UP_ROWS)[:, None], nc, 1).reshape(-1, 1)      # by the row's angle above the edge
    NRM = N_sq * (1 - wsh) + N_sh * wsh; NRM /= np.linalg.norm(NRM, axis=1, keepdims=True)
    ob.data.normals_split_custom_set([tuple(NRM[ob.data.loops[l].vertex_index]) for l in range(len(ob.data.loops))])
    lid_objects.append((ob, 'lidU_' + tag)); P['lidU_' + tag] = tuple(float(c) for c in piv)
    LID_PAINT['lidU.' + tag] = dict(V=V, rows=UP_ROWS, uu=L['uu'], Xs=L['Xs'], piv=piv, k=k, tag=tag)
    sc_ = LD.score2(dict(L, V=V)); sc_.pop('worst(a, colX, row, mm, X, Z)', None)
    lid_info['Ochiyo_lidU_' + tag] = {'pivot': [round(float(c), 5) for c in piv], 'cap': capinfo, 'columns(X, r_b_mm, eye_clear_mm, hid_above_mm, hid_below_mm)': L['diag'], **sc_}
    # ---- lower
    Lo = LD.lower(tag, LID_TILT, dz=env('LOW_DZ', '2.0'), arch_c=env('ARCH_C', '.62'), arch_e=env('ARCH_E', '.30'), target=LOW_T)
    Vl = np.transpose(Lo['V'], (1, 0, 2)).copy(); nrl, ncl = Vl.shape[0], Vl.shape[1]; pivl = Lo['Pv']
    Vlf, capl = cap_radii(Vl.reshape(-1, 3), pivl, k, (.04, 0., -.05, -.08, -.10, -.12, -.16, -.20, -.24, -.28, -.32, -.36), tag, (-.30, -.24, -.20), nrl, ncl, margin=.0026)
    Vl = Vlf.reshape(nrl, ncl, 3)
    uvl = np.stack(np.meshgrid((Lo['Xs'] - Lo['Xs'][0]) / (Lo['Xs'][-1] - Lo['Xs'][0]), np.linspace(0, 1, nrl)), -1)
    obl = mesh_grid('Ochiyo_lidD_' + tag, Vl, uvl, 'lidD.' + tag, nrl, ncl); orient_out(obl, pivl, k)
    NRl = skin_normals(Vl.reshape(-1, 3), pivl, k, (-.10, LOW_T))
    obl.data.normals_split_custom_set([tuple(NRl[obl.data.loops[l].vertex_index]) for l in range(len(obl.data.loops))])
    lid_objects.append((obl, 'lidD_' + tag)); P['lidD_' + tag] = tuple(float(c) for c in pivl)
    LID_PAINT['lidD.' + tag] = dict(V=Vl, tag=tag, piv=pivl, k=k)
    lid_info['Ochiyo_lidD_' + tag] = {'pivot': [round(float(c), 5) for c in pivl], 'cap': capl}
print('LIDS', json.dumps(lid_info, default=float), flush=True)

# ---------------------------------------------------------------- the lash ribbons through the blink (they ride lidU)
LASH_SWEEP = {}
for tag in 'LR':
    Vr = np.array([list(v.co) for v in OBJ['Ochiyo_lash_' + tag].data.vertices]); piv = np.array(P['lidU_' + tag]); k = hinge(tag)
    out = {}
    for a in (0., .18, .488, .8, 1.0, 1.22):
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
    """the head's own paint (patch, blush, warm shade) at the skin point under each lid point"""
    Q = P_.reshape(-1, 3).copy()
    for _ in range(4): Q = Q - head_sdf(Q)[:, None] * grad_n(Q)
    return ns['paint_head_P'](Q).reshape(P_.shape)
RIB_T = env('RIB_T', '.0080'); RIB_DIAG = {}
def paint_lids():
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    w_, h_ = img.size; px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    rgb, mix = ns['rgb'], ns['mix']
    for chart, info in LID_PAINT.items():
        x0, y0, w, h = ns['CHARTS'][chart]
        U, Vv = np.meshgrid(np.clip((np.arange(w) - 6) / (w - 12), 0, 1), np.clip((np.arange(h) - 6) / (h - 12), 0, 1))
        if chart.startswith('lidU'):              # the skin's paint where the lid shows (near shut)
            Pt = grid_point(info['V'], info['rows'] / info['rows'][-1], U, Vv)
            rows_a = Vv * info['rows'][-1]                                  # the texel's row angle above the edge
            C_sh = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], 1.22).reshape(Pt.shape))
            C_sq = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], .25).reshape(Pt.shape))
            C = mix(C_sq, C_sh, smooth(.22, .55, rows_a))                  # edge rows show at the squint, the rest when shut
            V = info['V']; nr, nc, _ = V.shape; vrow = info['rows'] / info['rows'][-1]
            arc = np.array([[np.linalg.norm(V[j, i] - V[0, i]) for i in range(nc)] for j in range(nr)])
            ci = np.clip(U * (nc - 1), 0, nc - 1.0001); i0 = ci.astype(int); fa = ci - i0
            jj = np.clip(np.searchsorted(vrow, Vv, side='right') - 1, 0, nr - 2); fb = (Vv - vrow[jj]) / (vrow[jj + 1] - vrow[jj])
            A_ = (arc[jj, i0] * (1 - fa) * (1 - fb) + arc[jj, i0 + 1] * fa * (1 - fb) + arc[jj + 1, i0] * (1 - fa) * fb + arc[jj + 1, i0 + 1] * fa * fb)
            C = mix(C, rgb('lash'), 1 - smooth(.0050, .0068, A_))          # the lid's own lash band (6 mm): with the ribbon, a solid shut U
            # the shut "U": per column, where the shut lid comes out of the skin above the lower rim, a dark band ~8 mm up the lid
            # (with the riding ribbon under it the closed eye reads as one solid lash curve ~0.02 W thick), flicking up outward
            tag = info['tag']; Xc = info['Xs']
            Vs = rot_axis(V.reshape(-1, 3), info['piv'], info['k'], 1.22).reshape(nr, nc, 3); em = np.full(nc, np.nan)
            for i in range(nc):                   # where the shut lid crosses the opening's lower outline (front projection)
                sr = LD.eye_sr(tag, Vs[:, i]) - 1.0; Zr = LD.eye_XZ(tag, Vs[:, i])[1]
                cr = np.where((sr[:-1] > 0) & (sr[1:] <= 0) & (Zr[:-1] < 0))[0]
                if len(cr):
                    j = int(cr[0]); f_ = float(np.clip(sr[j] / max(sr[j] - sr[j + 1], 1e-9), 0, 1)); em[i] = arc[j, i] + (arc[j + 1, i] - arc[j, i]) * f_
            ok = np.isfinite(em) & (np.abs(Xc) < 1.02)
            RIB_DIAG[chart] = {'cols': int(ok.sum()), 'emerge_mm': [round(float(v) * 1000, 1) if np.isfinite(v) else None for v in em]}
            if ok.sum() >= 4:
                cf = np.polyfit(Xc[ok], em[ok], 2); emf = np.polyval(cf, Xc)
                inside = (Xc >= Xc[ok].min() - 1e-6) & (Xc <= Xc[ok].max() + 1e-6)
                e0 = np.interp(ci, np.arange(nc), emf); ins = np.interp(ci, np.arange(nc), inside.astype(float)) > .5
                Xi = np.interp(ci, np.arange(nc), Xc)
                taper = np.clip((Xi + 1.0) / .35, 0, 1) ** .7; flick = .0045 * smooth(.45, .98, Xi) ** 2
                top = e0 + (RIB_T * taper + flick)
                near = 1 - smooth(.0085, .0130, e0)                       # only where the shut crossing is close to the edge (no stray arms mid-blink)
                rib = smooth(e0 - .0016, e0 - .0006, A_) * (1 - smooth(top - .0008, top + .0008, A_)) * ins * near
                C = mix(C, rgb('lash'), rib)
        else:                                      # the lower lid: the skin's paint at the happy pose, a soft warm crease on its edge
            Vl_ = info['V']; Pt = grid_point(Vl_, np.linspace(0, 1, Vl_.shape[0]), U, Vv)
            C = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], -.06).reshape(Pt.shape))     # the cheek it rises from
            C = mix(C, rgb('#d9ab92'), .55 * np.exp(-((Vv - .03) / .03) ** 2))
            C = mix(C, rgb('#a87866'), .35 * (1 - smooth(.0, .03, Vv)))
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'ak-ochiyo-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()

# ---------------------------------------------------------------- mouth: part the skin along the painted "w", add the cavity
def smile_z(x):
    t = min(abs(x) / MHW, 1.0)
    return CHIN + (.191 + .002 * t - .094 * t * (1 - t) + .006 * sm(.80, 1., t)) * W      # the painted "w" (build: paint_head_P)
CUT = .94 * MHW
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Ochiyo_head']; uvl = old.uv_layers.active.data
verts = []; vlab = []; vkind = []; faces = []; fuv = []; fno = []; cache = {}; seam = []
def addv(rec, kind):
    co, uv, no, lab = rec
    if kind is None: kind = 'lower' if (lab == 'ochiyo_head_skin' and co.z < smile_z(co.x)) else 'upper'
    key = (tuple(round(float(c), 7) for c in co), tuple(round(float(c), 6) for c in uv), tuple(round(float(c), 4) for c in no), lab, kind)
    if key not in cache:
        cache[key] = len(verts); verts.append(tuple(co)); vlab.append(lab); vkind.append(kind)
    return cache[key]
def emit(recs, kind):
    if len(recs) < 3: return
    for k_ in range(1, len(recs) - 1):
        rr = [recs[0], recs[k_], recs[k_ + 1]]
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
    skin_ = rr[0][3] == 'ochiyo_head_skin'
    cut = skin_ and max(r[0].y for r in rr) < HY - .10 and max(abs(r[0].x) for r in rr) < CUT and min(f) < 0 < max(f)
    if cut: emit(clip(rr, True), 'upper'); emit(clip(rr, False), 'lower')
    else: emit(rr, None)
me = bpy.data.meshes.new('Ochiyo_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, u in zip(poly.loop_indices, uu): layer.data[l].uv = u
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < .0003) & np.array([l_ == 'ochiyo_head_skin' for l_ in FL])
FN[onsk] = grad_n(FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Ochiyo_head'] = vlab
seam = sorted(set(tuple(round(c, 7) for c in p) for p in seam), key=lambda p: p[0])
rim = []
for p in seam:
    if not rim or p[0] - rim[-1][0] > .0016: rim.append(p)
assert len(rim) >= 10, len(rim)
LOG['mouth_seam_points'] = len(rim)

# ---------------------------------------------------------------- weights
def lip_w(x, z):
    return .85 * math.exp(-((abs(x) - MHW) / (.034 * W)) ** 2 - ((z - corner_z) / (.034 * W)) ** 2)
def jaw_w(x, y, z, kind):
    q = M2L(np.array([x, y, z])); xl, yl, zl = q; b = yl - NOSE_TIP_L
    sharp = 1.0 if kind == 'lower' else 0.0
    field = 1 - sm(-.006 * W, .010 * W, z - smile_z(x))           # the whole skin around the sealed corners
    we = sm(.74 * CUT, CUT, abs(x)); below = sharp * (1 - we) + field * we
    lat = 1 - sm(.11, .25, abs(xl)); back = 1 - sm(.36, .48, b)
    return below * lat * back
def face_weights(p, lab, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    q = M2L(np.array(p)); zl = q[2]; b = q[1] - NOSE_TIP_L
    lip = lip_w(x, z) * (1 - sm(-.22, -.12, y - HY))
    jw = jaw_w(x, y, z, kind)
    neck = sm(.06, -.01, zl) * sm(.30, .45, b) * .5                # the hidden underside rides a little with the neck
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
ARMS = {tag: ns['joint_arms'][tag] for tag in 'LR'}
ARM_D = {tag: (np.array(ARMS[tag]['wrist']) - np.array(ARMS[tag]['shoulder'])) / np.linalg.norm(np.array(ARMS[tag]['wrist']) - np.array(ARMS[tag]['shoulder'])) for tag in 'LR'}
ARM_LEN = {tag: float(np.linalg.norm(np.array(ARMS[tag]['wrist']) - np.array(ARMS[tag]['shoulder']))) for tag in 'LR'}
TP = np.array([list(v) for v in ns['tpath']]); TS = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(TP, axis=0), axis=1))])
TJ_S = [float(TS[np.argmin(np.linalg.norm(TP - j, axis=1))]) for j in TJ[:4]]
def tail_weights(p):
    i = int(np.argmin(np.linalg.norm(TP - np.asarray(p), axis=1))); s_ = float(TS[i])
    w = {}
    for b in range(4):                                   # hat functions along the arc, the last bone holds to the end
        lo = TJ_S[b - 1] if b > 0 else -1.; mid = TJ_S[b]; hi = TJ_S[b + 1] if b < 3 else 9.
        if s_ <= mid: v = 1. if b == 0 else sm(lo, mid, s_)
        else: v = 1. if b == 3 else 1 - sm(mid, hi, s_)
        if v > 0: w['tail%d' % (b + 1)] = v
    root = 1 - sm(.0, .035, s_)                          # the very root (inside the skirt) rides the hips a little
    w = {k_: v * (1 - .5 * root) for k_, v in w.items()}; w['hips'] = .5 * root
    return w
def thigh_split(x, th, width=.10):
    wl = th * sm(-width, width, x); return wl, th - wl
def torso_w(x, z, arm_on=True, side='L'):
    hips = 1 - sm(.330, .372, z); chest = sm(.415, .490, z); top = sm(.530, .585, z)
    arm = (.25 * sm(.11, .16, abs(x)) * sm(.46, .52, z) * (1 - top)) if arm_on else 0.      # the armhole rides a little with the sleeve
    return {'hips': hips * (1 - top), 'spine': (1 - hips) * (1 - chest) * (1 - top), 'chest': (1 - hips) * chest * (1 - top) * (1 - arm),
            'upperarm_' + side: (1 - hips) * chest * (1 - top) * arm, 'neck': .70 * top, 'head': .30 * top}
def obi_w(z):
    sp = sm(.335, .400, z); return {'hips': 1 - sp, 'spine': sp}
def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab.endswith('.L'): side = 'L'
    if lab.endswith('.R'): side = 'R'
    if lab.startswith('lash_line.'): return {'lidU_' + side: 1.}               # the lash rides the upper lid's edge
    if lab == 'kimono_torso': return torso_w(x, z, True, side)
    if lab in ('apron_bib',) or lab.startswith('apron_strap'): return torso_w(x, z, False, side)   # the bib and straps ride the chest / spine
    if lab.startswith('collar_band'):                                          # chest, riding a little with the neck toward the top
        r = sm(.500, .560, z); return {'chest': .80 - .30 * r, 'neck': .20 + .22 * r, 'head': .08 * r}
    if lab == 'obi_sash': return obi_w(z)
    if lab == 'obi_pillow_knot': return obi_w(float(ns['KNOT_C'][2]))         # rigid, as the obi at its middle
    if lab == 'a_line_skirt':                                                  # each side follows its thigh toward the hem
        th = .86 * float(np.clip((.336 - z) / .229, 0, 1)) ** .60
        wl, wr = thigh_split(x, th); return {'hips': 1 - th, 'thigh_L': wl, 'thigh_R': wr}
    if lab == 'pinafore_apron':                                                # hips + thighs exactly as the skirt behind it (no crossing when sitting / running)
        th = .86 * float(np.clip((.336 - z) / .229, 0, 1)) ** .60
        wl, wr = thigh_split(x, th); return {'hips': 1 - th, 'thigh_L': wl, 'thigh_R': wr}
    if lab.startswith('kimono_sleeve'):                                        # the sleeve on the upper arm, the cap blending to the chest
        t = float((np.array(p) - np.array(ARMS[side]['shoulder'])) @ ARM_D[side])
        chest = .45 * (1 - sm(-.050, .030, t)); return {'chest': chest, 'upperarm_' + side: 1 - chest}
    if lab.startswith('short_arm'):
        t = float((np.array(p) - np.array(ARMS[side]['shoulder'])) @ ARM_D[side]); Lw = ARM_LEN[side]
        fore = sm(.42 * Lw, .62 * Lw, t); hand = sm(.88 * Lw, 1.0 * Lw, t); chest = .25 * (1 - sm(-.04, .03, t))
        return {'chest': chest, 'upperarm_' + side: (1 - chest) * (1 - fore), 'forearm_' + side: (1 - chest) * fore * (1 - hand),
                'hand_' + side: (1 - chest) * fore * hand}
    if lab.startswith('mitten_paw'): return {'hand_' + side: 1.}
    if lab.startswith('bean_foot'): return {'foot_' + side: 1.}
    if lab.startswith('stubby_leg'):
        hips = sm(.282, .315, z); shin = 1 - sm(.150, .210, z); foot = 1 - sm(.062, .092, z)
        return {'hips': hips, 'thigh_' + side: (1 - hips) * (1 - shin), 'shin_' + side: (1 - hips) * shin * (1 - foot), 'foot_' + side: (1 - hips) * shin * foot}
    if lab == 'calico_tail': return tail_weights(p)
    raise KeyError(lab)
def ear_weights(p, s):
    """a spring ear: the root (buried in the head) on the head, the ear on ear_*, blending to earTip_* over its top half"""
    E = ns['ear_info'][s]; tag = 'L' if s > 0 else 'R'
    hz = float((np.asarray(p) - E['S']) @ E['w']) / float(np.linalg.norm(E['T'] - E['S']))     # 0 at the base on the skin .. 1 at the tip
    hd = 1 - sm(-.10, .10, hz); tip = sm(.45, .95, hz)
    return {'head': hd, 'ear_' + tag: (1 - hd) * (1 - tip), 'earTip_' + tag: (1 - hd) * tip}

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
adata = bpy.data.armatures.new('Ochiyo_game_skeleton'); arm = bpy.data.objects.new('Ochiyo_Rig', adata); bpy.context.collection.objects.link(arm)
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
            px_ = x * (1 - .06 * t)
            if j: py = max(py, skin_front(px_, pz) + .005)
            cav_v.append((px_, py, pz))
            ww = face_weights((x, y, z), 'ochiyo_head_skin', level)
            sd_ = 'L' if x >= 0 else 'R'
            if level == 'upper': ww = {'head': 1 - ww['lip_' + sd_], 'lip_' + sd_: ww['lip_' + sd_]}
            cav_w.append(ww)
for k_ in range(2):
    off = k_ * (D + 1) * n
    for j in range(D):
        for i in range(n - 1): cav_f.append((off + j * n + i, off + j * n + i + 1, off + (j + 1) * n + i + 1, off + (j + 1) * n + i))
for i in range(n - 1): cav_f.append((D * n + i, D * n + i + 1, (2 * D + 1) * n + i + 1, (2 * D + 1) * n + i))   # back wall
for i in (0, n - 1):
    for j in range(D): cav_f.append((j * n + i, (j + 1) * n + i, (D + 2 + j) * n + i, (D + 1 + j) * n + i))
def make_mesh(name, coords, polys, chart):
    me_ = bpy.data.meshes.new(name); me_.from_pydata(coords, [], polys); me_.update(); layer_ = me_.uv_layers.new(name='Atlas')
    for p in me_.polygons:
        p.use_smooth = True
        for l in p.loop_indices: layer_.data[l].uv = tuple(au(chart, .5, .5))
    ob_ = bpy.data.objects.new(name, me_); bpy.context.collection.objects.link(ob_); me_.materials.append(MAT); return ob_
mouth = make_mesh('Ochiyo_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
cc = Vector((0, rim[len(rim) // 2][1] + .03, MC))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()        # faces look into the pocket
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .034; TC_ = np.array([0, ty, CHIN + .152 * W]); TR_ = np.array([.050, .036, .010]) * W
tv = []; tf = []; nseg, nrng = 14, 8
for j in range(nrng + 1):
    ph = math.pi * j / nrng
    for i in range(nseg): a = 2 * math.pi * i / nseg; tv.append(tuple(TC_ + TR_ * np.array([math.sin(ph) * math.cos(a), math.sin(ph) * math.sin(a), -math.cos(ph)])))
for j in range(nrng):
    for i in range(nseg): tf.append((j * nseg + i, j * nseg + (i + 1) % nseg, (j + 1) * nseg + (i + 1) % nseg, (j + 1) * nseg + i))
tongue = make_mesh('Ochiyo_tongue', tv, tf, 'tongue')
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
    if o.name == 'Ochiyo_head': weights = [face_weights(p, l, k_) for p, l, k_ in zip(pp, lab, vkind)]
    elif o.name.startswith('Ochiyo_eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    elif o.name.startswith('Ochiyo_ear_'): weights = [ear_weights(p, 1 if o.name[-1] == 'L' else -1) for p in pp]
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
        Vr = rot_axis(V, piv, hinge(bname[-1]), ang); sd = head_sdf(Vr)
        op = LD.in_opening(bname[-1], Vr)
        hidden[f'{o.name}@{ang}'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum()),
                                    'over_opening_count': int(op.sum())}
def cam_up(yaw_deg, elev_deg):
    e = math.radians(elev_deg); y = math.radians(yaw_deg)
    d = np.array([math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e)])
    right = np.cross(-d, [0, 0, 1.]); right /= np.linalg.norm(right); up = np.cross(right, -d); return up
def edge_screen(sq):
    """the upper lid's visible edge at a squint: screen height (W) of its outer end and middle relative to the inner end, and
    the share of the opening's height it covers at the middle"""
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
EDGES = {sq_: edge_screen(sq_) for sq_ in (.12, SQ_U, .26, .488)}
print('EDGE_SCREEN', json.dumps(EDGES), flush=True)
sd = head_sdf(np.array([list(v.co) for v in tongue.data.vertices]))
hidden['Ochiyo_tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
print('HIDDEN', json.dumps(hidden), flush=True)
def proud_sweep(o, bname):
    tag = bname[-1]; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices]); out = {}
    angs = np.round(np.linspace(0, 1.22, 13), 3) if bname.startswith('lidU') else np.round([0., -.10, -.18, -.24, -.30, -.34], 3)
    for a in angs:
        Va = rot_axis(V, piv, hinge(tag), a); op = LD.in_opening(tag, Va) | (LD.eye_sr(tag, Va) < .985); sd = np.where(op, -9., head_sdf(Va))
        bad = sd > .0005; out[float(a)] = [int(bad.sum()), round(float(sd.max()) * 1000, 1)]
    return out
PROUD = {o.name: proud_sweep(o, b) for o, b in lid_objects}
for o, bname in lid_objects:
    if bname != 'lidD_R': continue
    V = np.array([list(v.co) for v in o.data.vertices]); nrl_, ncl_ = LID_PAINT['lidD.R']['V'].shape[:2]
    Va = rot_axis(V, np.array(P[bname]), hinge('R'), -.10); op = LD.in_opening('R', Va) | (LD.eye_sr('R', Va) < .985); sd = np.where(op, -9., head_sdf(Va))
    X_, Z_ = LD.eye_XZ('R', Va)
    print('LOWDBG', [(int(i) // ncl_, int(i) % ncl_, round(float(X_[i]), 2), round(float(Z_[i]), 2), round(float(sd[i]) * 1000, 1)) for i in np.argsort(-sd)[:12]], flush=True)
print('PROUD', json.dumps(PROUD), flush=True)
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'ak-ochiyo-toy_rig.blend'))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]]} for b in HERO],
       'triangles': total, 'lidTilt': LID_TILT, 'squint_designed_for': [SQ_U, LOW_T],
       'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'}, 'lids': lid_info, 'lids_hidden_check': hidden,
       'lash_sweep': LASH_SWEEP, 'shut_U_band': RIB_DIAG, 'happy_edge_screen': EDGES, 'proud_outside_opening(count, max_mm)': PROUD, **LOG,
       'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids turn about the tilted hinge (cos t, +-sin t, 0) through their bone head (HERO_MODELS lidTilt = t).',
                 'The lash ribbons (Ochiyo_lash_L/R) are weighted 100% to lidU_L/R and ride the upper lid, whose rest edge runs just under the ribbon.',
                 'Upper-lid colour = the head paint (patch, blush) at the near-shut pose; shading normals = the skin normals over lidU 0.8-1.22.',
                 'Skirt: hips, each side following its thigh toward the hem (0.86 at the hem). Apron panel: the same field as the skirt behind it.',
                 'Bib and straps follow the torso (spine / chest). Obi on hips -> spine, its pillow knot rigid. Collar bands on the chest riding with the neck toward the top.',
                 'Ears: root on the head, ear_*, earTip_* over the top half. Tail along tail1-4, its root riding the hips a little.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2, default=float))
print('OCHIYO_RIG', json.dumps({'bones': len(HERO), 'triangles': total}), flush=True)
