"""Grandma Sasa (tk-sasa-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, the game's world-axis contract.

    blender --background --factory-startup --python rig_tk-sasa-toy.py

Runs build_tk-sasa-toy.py in RIG_MODE (part labels, the rig atlas charts, two extra blend loops round each eye hole; the
approved GLB / blend / JSON are not touched, and at rest every bone leaves the approved look exactly as it was), then adds:
  - the armature: exactly the hero contract, identity rest orientations, heads at the joints;
  - the moving upper lids (rig_lids.Lids.upper3, Pan's): rigid shells about the game's tilted lid hinge (lidTilt = her eyes'
    31.5 deg outward facing), hidden under the skin above the opening at rest, designed at the happy squint (LID_SQ) as a
    level edge a little higher at the outer corner; shut (+1.22) they tuck under the lower rim where a painted lash ribbon
    draws the closed "U". Their colour comes from the skin's own paint (the patch) at the pose where they show;
  - the lower lids: built at the happy pose (-0.24) hugging the eye, under the cheek at the neutral -0.10;
  - the mouth: the skin parted along the painted smile between sealed corners, a closed cavity and a tongue;
  - weights (<= 4 influences, quantized to an exact 255 sum): the costume per the shared rig brief (the skirt on the hips
    with each side following its thigh toward the hem, Rosie's recipe; the kerchief on the chest riding a little with the
    neck; stiff ears) and saves tk-sasa-toy_rig.blend with only Armature modifiers.
Round 2 (director): the lash ribbons ride the upper lids (weighted to lidU_*); the lid's rest edge runs under them.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
ns = {'__file__': str(ROOT / 'build_tk-sasa-toy.py'), '__name__': 'sasa_model', 'RIG_MODE': True}
exec(compile((ROOT / 'build_tk-sasa-toy.py').read_text(encoding='utf-8'), str(ROOT / 'build_tk-sasa-toy.py'), 'exec'), ns)
import rig_lids
from rig_lids import rot_axis
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MC, MHW = ns['MC'], ns['MHW']
smooth, au, MAT, M2L = ns['smooth'], ns['au'], ns['MAT'], ns['M2L']
head_sdf, front_hit, grad_n = ns['head_sdf'], ns['front_hit'], ns['grad_n']
NOSE_TIP_L = ns['NOSE_TIP_L']
def sm(a, b, x): return float(smooth(a, b, x))
LID_TILT = float(os.environ.get('LID_TILT', '.550'))      # = the eyes' measured outward facing (31.5 deg, the model report)
LID_SQ = float(os.environ.get('LID_SQ', '0'))            # round 2 (director): the lid is designed AT REST, its edge under the lash ribbon, which rides on it
LID_B, LID_ZO = float(os.environ.get('LID_B', '.058')), float(os.environ.get('LID_ZO', '-.20'))   # a ~75 mm lever: shut (1.22) brings the lash ribbon to the lower rim
LID_LIFT = float(os.environ.get('LID_LIFT', '-.0006'))      # the lid's circle passes 0.6 mm under the skin at the opening's top (no ledge when the lash leaves)
LOW_T = float(os.environ.get('LOW_T', '-.30'))             # round 2: the lower lid designed at the game's happy -0.30
LID_ZLEV, LID_SLOPE = float(os.environ.get('LID_ZLEV', '.44')), float(os.environ.get('LID_SLOPE', '.06'))   # the squint edge (EHH): ~28% of the opening
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
head = OBJ['Sasa_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Sasa_eye_' + t].data.vertices], [tuple(p.vertices) for p in OBJ['Sasa_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
LD = rig_lids.Lids(ns, eye_tree)
def hinge(tag): return LD.hinge(tag, LID_TILT)

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
mouth_y = float(front_hit(0., CHIN + .235 * W)[0]); corner_z = CHIN + .252 * W
P = {'root': (0, -.004, 0), 'hips': (0, .002, .262), 'spine': (0, .004, .340), 'chest': (0, .006, .440), 'neck': (0, .008, .545),
     'head': (0, .045, CHIN + .006),                                     # the skull base: the nod pivot at the back of the neck
     'jaw': (0, mouth_y + .22 * W, corner_z)}                            # the hinge line inside the head, 0.22 W behind the mouth
for s, tag in ((1, 'L'), (-1, 'R')):
    P['eye_' + tag] = tuple(ns['eye_centers'][tag])
    P['brow_' + tag] = (s * ns['BROW_X'], float(front_hit(s * ns['BROW_X'], ns['BROW_Z'])[0]) + .012, ns['BROW_Z'])
    P['lip_' + tag] = (s * MHW, float(front_hit(s * MHW, corner_z)[0]) + .002, corner_z)
    E = ns['ear_info'][s]; up_ = E['R'][:, 2]
    P['ear_' + tag] = tuple(float(c) for c in E['base'])
    P['earTip_' + tag] = tuple(float(c) for c in E['C'] + up_ * ns['EAR']['r'] * W * .45)
    ja = ns['joint_arms'][tag]
    P['upperarm_' + tag] = tuple(ja['shoulder']); P['forearm_' + tag] = tuple(ja['elbow']); P['hand_' + tag] = tuple(ja['wrist'])
    jl = ns['joint_legs'][tag]
    P['thigh_' + tag] = (s * .110, .002, .250); P['shin_' + tag] = tuple(jl['knee']); P['foot_' + tag] = tuple(jl['ankle'])
TC = np.array(ns['TAIL'][0])
for i, dy in enumerate((-.030, .000, .022, .040)): P['tail%d' % (i + 1)] = tuple(float(c) for c in TC + np.array([0, dy, 0]))   # the root inside the obi's back

# ---------------------------------------------------------------- eyelids
lid_objects = []; lid_info = {}; LID_PAINT = {}
def mesh_grid(name, V, uvs, chart, nr, nc, normals=None):
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
def skin_normals(Vrest, piv, k, a_max, n_a=13, w_end=8.):
    """shading normals: the head ball's own normal under each vertex, averaged in the lid's frame over every angle at which
    the vertex shows (the end pose weighted), so the moving lid meets the black patch round it without a lighter patch"""
    acc = np.zeros_like(Vrest)
    for a in np.linspace(0, a_max, n_a):
        Pp = rot_axis(Vrest, piv, k, a); vis = head_sdf(Pp) > -.0006
        Q = Pp.copy()
        for _ in range(3): Q = Q - head_sdf(Q)[:, None] * grad_n(Q)
        n = rot_axis(grad_n(Q), np.zeros(3), k, -a)
        w = np.where(vis, w_end if a == a_max else 1., 0.)
        if a == a_max: w = np.maximum(w, 1e-3)
        acc += w[:, None] * n
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
            ok = np.isfinite(ed) & ((r[idx] >= ed - .001) | (os.environ.get('FLOOR_ALL', '1') == '1'))   # round 2: all of them (with the lash riding the lid, the lid's top shows)
            floor[idx[ok]] = np.maximum(floor[idx[ok]], ed[ok] + eye_gap)
    sh = need.reshape(nr, nc); raw = sh.copy()
    for _ in range(10):
        p_ = np.pad(sh, 1, mode='edge'); sh = .2 * (p_[1:-1, 1:-1] + p_[:-2, 1:-1] + p_[2:, 1:-1] + p_[1:-1, :-2] + p_[1:-1, 2:])
        sh = np.maximum(sh, raw)
    if keep_rows: sh[:keep_rows] = np.minimum(sh[:keep_rows], raw[:keep_rows])
    r_new = np.maximum(r - sh.ravel(), floor)
    return piv + ax + u * r_new[:, None], {'capped': int((r_new < r - 1e-6).sum()), 'max_shrink_mm': round(float((r - r_new).max()) * 1000, 1),
                                           'floored': int((r_new > r - sh.ravel() + 1e-6).sum())}
UP_ROWS = np.r_[np.linspace(0, .12, 5), np.linspace(.12, 1.55, 21)[1:]]       # body angles above the edge (fine at the edge)
_tt = np.linspace(0, 1, 400); _C2 = np.array([ns['catmull'](ns['LASH_CTRL'], t) for t in _tt]); _hw = np.maximum(ns['lash_halfw'](_tt), .030)
LASH_EDGE_K = float(os.environ.get('LASH_EDGE_K', '.30'))
def lash_edge_Z(X):
    """the upper lid's rest edge (EHH): under the lash ribbon's centre line by LASH_EDGE_K of its half-width, so the ribbon (now on
    lidU) sits on the lid's edge in every pose; beyond the ribbon's inner end it carries on level"""
    return float(np.interp(X, _C2[:, 0], _C2[:, 1] - LASH_EDGE_K * _hw))
for tag in 'LR':
    s = 1 if tag == 'L' else -1; k = hinge(tag)
    # ---- upper
    L = LD.upper3(tag, LID_TILT, LID_B, LID_ZO, u_sq=LID_SQ, zlev=LID_ZLEV, slope=LID_SLOPE, sink=-LID_LIFT, zfun=lash_edge_Z)
    cols = L['cols']; nc = len(cols)
    rows = [np.array([rot_axis(c_['E'][None], c_['A'], k, -LID_SQ - al)[0] for c_ in cols]) for al in UP_ROWS]
    V = np.array(rows); nr = V.shape[0]; piv = L['Pv']
    Vf, capinfo = cap_radii(V.reshape(-1, 3), piv, k, np.linspace(0, 1.22, 25), tag, (np.linspace(0, 1.22, 25) if os.environ.get('UP_FLOOR', '1') == '1' else ()), nr, nc, keep_rows=2, eye_gap=.0006)
    V = Vf.reshape(nr, nc, 3)
    uv = np.stack(np.meshgrid(L['uu'], UP_ROWS / UP_ROWS[-1]), -1)
    ob = mesh_grid('Sasa_lidU_' + tag, V, uv, 'lidU.' + tag, nr, nc); orient_out(ob, piv, k)
    NRM = skin_normals(V.reshape(-1, 3), piv, k, 1.22)
    ob.data.normals_split_custom_set([tuple(NRM[ob.data.loops[l].vertex_index]) for l in range(len(ob.data.loops))])
    lid_objects.append((ob, 'lidU_' + tag)); P['lidU_' + tag] = tuple(float(c) for c in piv)
    LID_PAINT['lidU.' + tag] = dict(V=V, rows=UP_ROWS, uu=L['uu'], Xs=L['Xs'], piv=piv, k=k, tag=tag)
    sc_ = LD.score2(dict(L, V=V)); sc_.pop('worst(a, colX, row, mm, X, Z)', None)
    lid_info['Sasa_lidU_' + tag] = {'pivot': [round(float(c), 5) for c in piv], 'cap': capinfo, 'columns(X, r_b_mm, eye_clear_mm, hid_above_mm, hid_below_mm)': L['diag'], **sc_}
    # ---- lower
    Lo = LD.lower(tag, LID_TILT, dz=float(os.environ.get('LOW_DZ', '.5')), arch_c=float(os.environ.get('ARCH_C', '.62')), arch_e=float(os.environ.get('ARCH_E', '.30')), target=LOW_T)
    Vl = np.transpose(Lo['V'], (1, 0, 2)).copy(); nrl, ncl = Vl.shape[0], Vl.shape[1]; pivl = Lo['Pv']
    Vlf, capl = cap_radii(Vl.reshape(-1, 3), pivl, k, (.04, 0., -.05, -.10, -.16, -.20, -.24, -.28, -.32, -.36), tag, (-.30, -.24, -.20), nrl, ncl, margin=.0014)
    Vl = Vlf.reshape(nrl, ncl, 3)
    uvl = np.stack(np.meshgrid((Lo['Xs'] - Lo['Xs'][0]) / (Lo['Xs'][-1] - Lo['Xs'][0]), np.linspace(0, 1, nrl)), -1)
    obl = mesh_grid('Sasa_lidD_' + tag, Vl, uvl, 'lidD.' + tag, nrl, ncl); orient_out(obl, pivl, k)
    NRl = skin_normals(Vl.reshape(-1, 3), pivl, k, LOW_T)
    obl.data.normals_split_custom_set([tuple(NRl[obl.data.loops[l].vertex_index]) for l in range(len(obl.data.loops))])
    lid_objects.append((obl, 'lidD_' + tag)); P['lidD_' + tag] = tuple(float(c) for c in pivl)
    LID_PAINT['lidD.' + tag] = dict(V=Vl, tag=tag, piv=pivl, k=k)
    lid_info['Sasa_lidD_' + tag] = {'pivot': [round(float(c), 5) for c in pivl], 'cap': capl}
print('LIDS', json.dumps(lid_info, default=float), flush=True)

# ---------------------------------------------------------------- lid paint: black (the patch), the lash edge, the shut ribbon
RIB_T = float(os.environ.get('RIB_T', '.0055'))         # the shut ribbon's height on the lid (m of arc above the lower rim)
RIB_DIAG = {}
def grid_point(V, rows_v, U, Vv):
    """bilinear point on a (rows x cols x 3) grid at chart coords (U along the columns, Vv along rows_v)"""
    nr, nc, _ = V.shape; ci = np.clip(U * (nc - 1), 0, nc - 1.0001); i0 = ci.astype(int); fa = (ci - i0)[..., None]
    jj = np.clip(np.searchsorted(rows_v, Vv, side='right') - 1, 0, nr - 2); fb = ((Vv - rows_v[jj]) / (rows_v[jj + 1] - rows_v[jj]))[..., None]
    return V[jj, i0] * (1 - fa) * (1 - fb) + V[jj, i0 + 1] * fa * (1 - fb) + V[jj + 1, i0] * (1 - fa) * fb + V[jj + 1, i0 + 1] * fa * fb
def skin_paint_at(P):
    """the skin's own paint where the lid shows: the eye patch (the lids live inside it), its black with the patch's soft cool
    light from the head's paint (paint_head_P's Cb), at the skin point under each lid point"""
    Q = P.reshape(-1, 3).copy()
    for _ in range(4): Q = Q - head_sdf(Q)[:, None] * grad_n(Q)
    n = grad_n(Q); zr = M2L(Q)[:, 2]; rgb, mix = ns['rgb'], ns['mix']
    Cb = mix(rgb('black'), rgb('#3b3642'), .55 * smooth(.42, .56, zr) * smooth(.0, .5, n[:, 2] + .3))
    return Cb.reshape(P.shape)
def paint_lids():
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    w_, h_ = img.size; px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    rgb, mix = ns['rgb'], ns['mix']
    for chart, info in LID_PAINT.items():
        x0, y0, w, h = ns['CHARTS'][chart]
        U, Vv = np.meshgrid(np.clip((np.arange(w) - 6) / (w - 12), 0, 1), np.clip((np.arange(h) - 6) / (h - 12), 0, 1))
        if chart.startswith('lidU'):              # the base colour: the skin's paint where the lid shows (shut)
            Pt = grid_point(info['V'], info['rows'] / info['rows'][-1], U, Vv)
            C = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], 1.22).reshape(Pt.shape))
        else:                                      # the lower lid: the skin's paint at the happy pose
            Vl_ = info['V']; Pt = grid_point(Vl_, np.linspace(0, 1, Vl_.shape[0]), U, Vv)
            C = skin_paint_at(rot_axis(Pt.reshape(-1, 3), info['piv'], info['k'], LOW_T).reshape(Pt.shape))
        if chart.startswith('lidU'):
            V = info['V']; rows = info['rows']; nr, nc, _ = V.shape; tag = info['tag']
            vrow = rows / rows[-1]
            arc = np.array([[np.linalg.norm(V[j, i] - V[0, i]) for i in range(nc)] for j in range(nr)])   # chord from the edge (m)
            # the edge's lash line: 4.5 mm on the lid's face, soft-edged
            A_ = np.zeros((h, w))
            ci = np.clip(U * (nc - 1), 0, nc - 1.0001); i0 = ci.astype(int); fa = ci - i0
            jj = np.clip(np.searchsorted(vrow, Vv, side='right') - 1, 0, nr - 2); fb = (Vv - vrow[jj]) / (vrow[jj + 1] - vrow[jj])
            A_ = (arc[jj, i0] * (1 - fa) * (1 - fb) + arc[jj, i0 + 1] * fa * (1 - fb) + arc[jj + 1, i0] * (1 - fa) * fb + arc[jj + 1, i0 + 1] * fa * fb)
            edge = 1 - smooth(.0030, .0042, A_)                                          # the lid's own lash line (no highlight: one lid, not two ledges)
            C = mix(C, rgb('lash'), edge)
            # the shut ribbon: per column, where the shut lid comes out of the skin above the lower rim (+ RIB_T)
            Vs = rot_axis(V.reshape(-1, 3), info['piv'], info['k'], 1.22).reshape(nr, nc, 3)
            em = np.full(nc, np.nan)
            for i in range(nc):
                sd = head_sdf(Vs[:, i]); vis = np.where(sd > -.0002)[0]
                if len(vis) and LD.eye_sr(tag, Vs[vis[0], i][None])[0] < 1.12:
                    j = int(vis[0]); em[i] = arc[j, i] if j == 0 else arc[j - 1, i] + (arc[j, i] - arc[j - 1, i]) * float(np.clip(-sd[j - 1] / max(sd[j] - sd[j - 1], 1e-9), 0, 1))
            if os.environ.get('RIB_DBG'):
                for i in (nc // 2, nc // 4, 3 * nc // 4):
                    sd = head_sdf(Vs[:, i]); X_, Z_ = LD.eye_XZ(tag, Vs[:, i])
                    print('RIBDBG', tag, i, [(j, round(float(sd[j]) * 1000, 1), round(float(X_[j]), 2), round(float(Z_[j]), 2)) for j in range(0, nr, 2)], flush=True)
            ok = np.isfinite(em)
            # one smooth curve across the columns (a quadratic in X through the valid emergences), carried on to the outer
            # corner where the shut lid still shows, so the ribbon is one clean stroke
            Xc_ = info['Xs']
            if ok.sum() >= 4:
                cf = np.polyfit(Xc_[ok], em[ok], 2); emf_all = np.polyval(cf, Xc_)
                vis_shut = np.array([(head_sdf(Vs[:, i]) > -.0002).any() for i in range(nc)])
                ok = (Xc_ >= Xc_[ok].min() - 1e-6) & vis_shut & (Xc_ <= .96); em = np.where(ok, emf_all, np.nan)
            RIB_DIAG[chart] = {'cols_with_ribbon': int(ok.sum()), 'emerge_mm': [round(float(v) * 1000, 1) if np.isfinite(v) else None for v in em]}
            if ok.any():
                Xc = info['Xs']; emf = np.interp(np.arange(nc), np.where(ok)[0], em[ok])
                taper = np.clip((Xc + 1.02) / .30, 0, 1) ** .7                     # thinner into the inner corner (no hook)
                e0 = np.interp(ci, np.arange(nc), emf); tp = np.interp(ci, np.arange(nc), taper)
                inside = np.interp(ci, np.arange(nc), np.where(ok, 1., 0.)) > .5
                rib = (smooth(e0 - .0040, e0 - .0028, A_) * (1 - smooth(e0 + RIB_T * tp - .0007, e0 + RIB_T * tp + .0007, A_))) * inside
                C = mix(C, rgb('lash'), rib * float(os.environ.get('RIB_ON', '0')))     # round 2: off (the riding lash ribbon replaces it; it streaked the squint band)
                # in the game the black patch renders as one flat dark: the shut eye reads by a light crease along the ribbon's top
                # (the sheet's sleepy face: a dark lash curve with a soft light edge), a fainter one under it
                # round 2 (director): the shut eye needs a solid lash curve from 45 deg: a light lilac-grey line ~0.02 W thick on
                # screen along the ribbon's top, rising into a flick at the outer corner (X > 0 is outer for both eyes)
                Xi = np.interp(ci, np.arange(nc), Xc)
                flick = .013 * smooth(.40, .96, Xi) ** 2
                half = .0046 * (1 - .55 * smooth(.80, .98, Xi)) * (.55 + .45 * tp)
                CR_UP = float(os.environ.get('CR_UP', '.90')) * ns['EHH']           # up the lid from the shut emergence: hidden at squints up to ~0.45, mid-eye when shut
                dA = A_ - (e0 + CR_UP + flick); crease = (1 - smooth(half, half + .0016, np.abs(dA))) * inside
                C = mix(C, rgb('#c8c0d4'), crease)
                pass                                                                   # (round 2: no grey line at the emergence: it showed above the lash at a squint)
        else:
            C = mix(C, rgb('#3c3846'), .55 * np.exp(-((Vv - .03) / .025) ** 2))      # a soft cool crease on the raised edge
            C = mix(C, rgb('lash'), .45 * (1 - smooth(.0, .02, Vv)))
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'tk-sasa-toy_rig_atlas.png')
    raw = b''.join(b'\x00' + r.tobytes() for r in a8[::-1]); chunk = ns['chunk']
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ns['struct'].pack('>IIBBBBB', w_, h_, 8, 6, 0, 0, 0)) + chunk(b'IDAT', ns['zlib'].compress(raw, 9)) + chunk(b'IEND', b''))
    new = bpy.data.images.load(path, check_existing=False); new.pack()
    for n in MAT.node_tree.nodes:
        if n.type == 'TEX_IMAGE': n.image = new
    nm = img.name; bpy.data.images.remove(img); new.name = nm
paint_lids()
print('RIBBON', json.dumps(RIB_DIAG), flush=True)

# ---------------------------------------------------------------- mouth: part the skin along the painted "w", add the cavity
def smile_z(x):
    t = min(abs(x) / MHW, 1.0)
    zm = .2175 + .0345 * t ** 2.2 + .0060 * math.exp(-(t * MHW / W / .012) ** 2)
    return CHIN + zm * W
CUT = .94 * MHW
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Sasa_head']; uvl = old.uv_layers.active.data
verts = []; vlab = []; vkind = []; faces = []; fuv = []; fno = []; cache = {}; seam = []
def addv(rec, kind):
    co, uv, no, lab = rec
    if kind is None: kind = 'lower' if (lab == 'sasa_head_skin' and co.z < smile_z(co.x)) else 'upper'
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
    skin_ = rr[0][3] == 'sasa_head_skin'
    cut = skin_ and max(r[0].y for r in rr) < HY - .10 and max(abs(r[0].x) for r in rr) < CUT and min(f) < 0 < max(f)
    if cut: emit(clip(rr, True), 'upper'); emit(clip(rr, False), 'lower')
    else: emit(rr, None)
me = bpy.data.meshes.new('Sasa_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, u in zip(poly.loop_indices, uu): layer.data[l].uv = u
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < .0003) & np.array([l_ == 'sasa_head_skin' for l_ in FL])
FN[onsk] = grad_n(FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Sasa_head'] = vlab
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
    lat = 1 - sm(.10, .24, abs(xl)); back = 1 - sm(.36, .48, b)
    return below * lat * back
def face_weights(p, lab, kind):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab.startswith('lash_'): return {'head': 1.}
    q = M2L(np.array(p)); zl = q[2]; b = q[1] - NOSE_TIP_L
    lip = lip_w(x, z) * (1 - sm(-.22, -.12, y - HY))
    jw = jaw_w(x, y, z, kind)
    neck = sm(.06, -.01, zl) * sm(.30, .45, b) * .5                # the hidden underside rides a little with the neck
    return {'lip_' + side: lip, 'jaw': (1 - lip) * jw, 'neck': (1 - lip) * (1 - jw) * neck, 'head': (1 - lip) * (1 - jw) * (1 - neck)}
ARMS = {tag: ns['joint_arms'][tag] for tag in 'LR'}
ARM_D = {tag: (np.array(ARMS[tag]['wrist']) - np.array(ARMS[tag]['shoulder'])) / np.linalg.norm(np.array(ARMS[tag]['wrist']) - np.array(ARMS[tag]['shoulder'])) for tag in 'LR'}
ARM_LEN = {tag: float(np.linalg.norm(np.array(ARMS[tag]['wrist']) - np.array(ARMS[tag]['shoulder']))) for tag in 'LR'}
def body_weights(p, lab):
    x, y, z = p; side = 'L' if x >= 0 else 'R'
    if lab.endswith('.L'): side = 'L'
    if lab.endswith('.R'): side = 'R'
    if lab.startswith('lash.'): return {'lidU_' + side: 1.}                   # round 2: the lash rides the upper lid's edge
    if lab == 'kimono_torso':
        hips = 1 - sm(.300, .345, z); chest = sm(.400, .470, z); top = sm(.548, .600, z)
        arm = .25 * sm(.11, .16, abs(x)) * sm(.45, .51, z) * (1 - top)          # the armhole rides a little with the sleeve
        return {'hips': hips * (1 - top), 'spine': (1 - hips) * (1 - chest) * (1 - top), 'chest': (1 - hips) * chest * (1 - top) * (1 - arm),
                'upperarm_' + side: (1 - hips) * chest * (1 - top) * arm, 'neck': .70 * top, 'head': .30 * top}
    if lab == 'obi_band':                                                       # the waist: hips at its lower edge, spine above
        sp = sm(.300, .375, z); return {'hips': 1 - sp, 'spine': sp}
    if lab == 'pleated_skirt':                                                  # Rosie's recipe: each side follows its thigh toward the hem
        th = .88 * float(np.clip((.335 - z) / .265, 0, 1)) ** .60                   # ~0.88 at the hem (the feet sit inside it), ~0.45 at the knees, 0 under the obi
        wl = th * float(sm(-.10, .10, x)); wr = th - wl                          # each side on its own thigh (the centre shares them)
        return {'hips': 1 - th, 'thigh_L': wl, 'thigh_R': wr}
    if lab in ('kerchief_band', 'kerchief_knot'):                               # chest, riding a little with the neck (more at the nape)
        r = sm(.540, .590, z); return {'chest': .72 - .22 * r, 'neck': .28 + .12 * r, 'head': .10 * r}
    if lab.startswith('kerchief_end'): return {'chest': 1.}
    if lab.startswith('kimono_sleeve'):                                         # the sleeve on the upper arm, the shoulder cap blending to the chest
        t = float((np.array(p) - np.array(ARMS[side]['shoulder'])) @ ARM_D[side])
        chest = .45 * (1 - sm(-.055, .035, t)); return {'chest': chest, 'upperarm_' + side: 1 - chest}
    if lab.startswith('arm.'):
        t = float((np.array(p) - np.array(ARMS[side]['shoulder'])) @ ARM_D[side]); Lw = ARM_LEN[side]
        fore = sm(.42 * Lw, .62 * Lw, t); hand = sm(.88 * Lw, 1.0 * Lw, t); chest = .25 * (1 - sm(-.04, .03, t))
        return {'chest': chest, 'upperarm_' + side: (1 - chest) * (1 - fore), 'forearm_' + side: (1 - chest) * fore * (1 - hand),
                'hand_' + side: (1 - chest) * fore * hand}
    if lab.startswith('big_foot'): return {'foot_' + side: 1.}
    if lab.startswith('leg.'):
        hips = sm(.262, .300, z); shin = 1 - sm(.140, .195, z); foot = 1 - sm(.062, .092, z)
        return {'hips': hips, 'thigh_' + side: (1 - hips) * (1 - shin), 'shin_' + side: (1 - hips) * shin * (1 - foot), 'foot_' + side: (1 - hips) * shin * foot}
    if lab == 'round_tail': return {'tail1': 1.}
    raise KeyError(lab)
def ear_weights(p, s):
    """stiff round ears (the director): the whole ear on ear_*, only its top quarter leaning a little on earTip_*"""
    E = ns['ear_info'][s]; tag = 'L' if s > 0 else 'R'; up_ = E['R'][:, 2]; r = ns['EAR']['r'] * W
    hz = float((np.asarray(p) - E['base']) @ up_) / (float((E['C'] - E['base']) @ up_) + r)     # 0 at the base .. 1 at the top
    tip = .30 * sm(.60, 1.0, hz); return {'ear_' + tag: 1 - tip, 'earTip_' + tag: tip}

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
adata = bpy.data.armatures.new('Sasa_game_skeleton'); arm = bpy.data.objects.new('Sasa_Rig', adata); bpy.context.collection.objects.link(arm)
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
            ww = face_weights((x, y, z), 'sasa_head_skin', level)
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
mouth = make_mesh('Sasa_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
cc = Vector((0, rim[len(rim) // 2][1] + .03, MC))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()        # faces look into the pocket
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .036; TC_ = np.array([0, ty, CHIN + .206 * W]); TR_ = np.array([.052, .038, .010]) * W
tv = []; tf = []; nseg, nrng = 14, 8
for j in range(nrng + 1):
    ph = math.pi * j / nrng
    for i in range(nseg): a = 2 * math.pi * i / nseg; tv.append(tuple(TC_ + TR_ * np.array([math.sin(ph) * math.cos(a), math.sin(ph) * math.sin(a), -math.cos(ph)])))
for j in range(nrng):
    for i in range(nseg): tf.append((j * nseg + i, j * nseg + (i + 1) % nseg, (j + 1) * nseg + (i + 1) % nseg, (j + 1) * nseg + i))
tongue = make_mesh('Sasa_tongue', tv, tf, 'tongue')
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
    if o.name == 'Sasa_head': weights = [face_weights(p, l, k_) for p, l, k_ in zip(pp, lab, vkind)]
    elif o.name.startswith('Sasa_eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    elif o.name.startswith('Sasa_ear_'): weights = [ear_weights(p, 1 if o.name[-1] == 'L' else -1) for p in pp]
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
    """the upper lid's visible edge at a squint, screen height (W) of its inner end, middle and outer end (front, game yaws)"""
    out = {}
    for o, bname in lid_objects:
        if not bname.startswith('lidU'): continue
        tag = bname[-1]; s_ = 1 if tag == 'L' else -1; info = LID_PAINT['lidU.' + tag]
        E = rot_axis(info['V'][0], np.array(P[bname]), hinge(tag), sq); vis = LD.eye_sr(tag, E) < .97
        Ev = E[vis]; Ev = Ev[np.argsort(s_ * Ev[:, 0])]
        res = {}
        for nm, (yaw, el) in (('front', (0, 0)), ('game0', (0, 35.5)), ('game+45', (45, 35.5)), ('game-45', (-45, 35.5))):
            h = Ev @ cam_up(yaw, el) / W
            res[nm] = {'outer_minus_inner_W': round(float(h[-1] - h[0]), 4), 'mid_minus_inner_W': round(float(h[len(h) // 2] - h[0]), 4)}
        out[tag] = res
    return out
EDGES = {sq_: edge_screen(sq_) for sq_ in (.26, LID_SQ, .488)}
print('EDGE_SCREEN', json.dumps(EDGES), flush=True)
sd = head_sdf(np.array([list(v.co) for v in tongue.data.vertices]))
hidden['Sasa_tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
print('HIDDEN', json.dumps(hidden), flush=True)
def proud_sweep(o, bname):
    tag = bname[-1]; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices]); out = {}
    angs = np.round(np.linspace(0, 1.22, 13), 3) if bname.startswith('lidU') else np.round([0., -.10, -.18, -.24, -.30, -.34], 3)
    for a in angs:
        Va = rot_axis(V, piv, hinge(tag), a); op = LD.in_opening(tag, Va) | (LD.eye_sr(tag, Va) < .985); sd = np.where(op, -9., head_sdf(Va))
        bad = sd > .0005; out[float(a)] = [int(bad.sum()), round(float(sd.max()) * 1000, 1)]
    return out
PROUD = {o.name: proud_sweep(o, b) for o, b in lid_objects}
if os.environ.get('PROUD_DBG'):
    o, bname = lid_objects[0]; tag = bname[-1]; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices])
    nc_ = len(LID_PAINT['lidU.' + tag]['Xs'])
    for a in (.5, 1.22):
        Va = rot_axis(V, piv, hinge(tag), a); op = LD.in_opening(tag, Va) | (LD.eye_sr(tag, Va) < .985); sd = np.where(op, -9., head_sdf(Va))
        for i in np.argsort(-sd)[:8]:
            j, c_ = divmod(int(i), nc_); X_, Z_ = LD.eye_XZ(tag, Va[i])
            # the same vertex over the sweep: where was it over the eye?
            trace = []
            for b_ in np.linspace(0, 1.22, 7):
                Vb = rot_axis(V[i:i + 1], piv, hinge(tag), b_); Xb, Zb = LD.eye_XZ(tag, Vb)
                trace.append((round(float(b_), 2), round(float(Xb[0]), 2), round(float(Zb[0]), 2), round(float(head_sdf(Vb)[0]) * 1000, 1)))
            print('PDBG', a, 'col', c_, 'X', round(float(LD_X[c_]), 2) if False else round(float(LID_PAINT['lidU.' + tag]['Xs'][c_]), 2), 'row', j, 'at', round(float(X_), 2), round(float(Z_), 2), 'sd_mm', round(float(sd[i]) * 1000, 1), 'trace', trace, flush=True)
print('PROUD', json.dumps(PROUD), flush=True)
for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4)
arm.data.pose_position = 'POSE'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tk-sasa-toy_rig.blend'))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]]} for b in HERO],
       'triangles': total, 'lidTilt': LID_TILT, 'squint_designed_for': [LID_SQ, -.24],
       'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'}, 'lids': lid_info, 'lids_hidden_check': hidden,
       'happy_edge_screen': EDGES, 'proud_outside_opening(count, max_mm)': PROUD, 'ribbon': RIB_DIAG, **LOG, 'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids turn about the tilted hinge (cos t, +-sin t, 0) through their bone head (HERO_MODELS lidTilt = t).',
                 'The skin eye hole is the full opening (her eyes are open). Round 2: the lash ribbons (Sasa_lash_L/R) are weighted 100% to'
                 ' lidU_L/R and ride the upper lid, whose rest edge runs just under the ribbon (hidden by it); one lash line in every pose.',
                 'Lid colour = the eye patch paint (black with its soft cool light). The shut eye: a light lilac-grey U (#c8c0d4, ~0.02 W) with an'
                 ' outer flick, painted 0.9 EHH up the lid from the shut emergence (hidden under the skin at squints up to ~0.45).',
                 'Lower lids designed at the happy -0.30.',
                 'Skirt: hips, each side following its thigh toward the hem (0.88 at the hem, ~0.45 at the knees, 0 under the obi).',
                 'Kerchief band and knot: chest 0.72-0.50, neck 0.28-0.40, head up to 0.10 at the nape; the leaf ends rigid on chest. Ears stiff (ear_* with earTip_* <= 0.30 at the top).',
                 'HERO_MODELS: lidTilt 0.550; squint [0.30, -0.30] (the lid edge now starts at the rim: 0.30 covers ~30% of the opening).']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2, default=float))
print('SASA_RIG', json.dumps({'bones': len(HERO), 'triangles': total}), flush=True)
