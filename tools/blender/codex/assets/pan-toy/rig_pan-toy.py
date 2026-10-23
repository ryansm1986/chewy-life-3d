"""Pan (pan-toy) phase 2: the 37-bone hero rig. Blender 4.3, deterministic, the game's world-axis contract.

    blender --background --factory-startup --python rig_pan-toy.py

Runs build_pan-toy.py in RIG_MODE (part labels, rig atlas charts, the skin's eye hole cut to the visible opening under the
sleepy rest lid, the approved lash ledge and wing kept as static head geometry; the approved GLB / blend / JSON are not
touched), then adds:
  - the armature: exactly the hero contract, identity rest orientations, heads at the joints;
  - the moving upper lids (rig_lids.Lids.upper2): rigid shells about the game's tilted lid hinge (lidTilt), hidden under
    the skin above the opening at rest, designed at the happy squint (LID_SQ) as a level edge a little higher at the
    outer corner; shut (+1.22) they tuck under the lower rim where a painted lash ribbon draws the closed "U";
  - the lower lids: built at the happy pose (-0.24) hugging the eye, under the cheek at the neutral -0.10;
  - the mouth: the skin parted along the painted "w" between sealed corners, a closed cavity and a tongue;
  - weights (<= 4 influences, quantized to an exact 255 sum) and saves pan-toy_rig.blend with only Armature modifiers.
The mouth, bind and check code follow Mochi's rig (tools/blender/work/codex/mochi-toy/rig_mochi-toy.py) and Rosie's.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
ns = {'__file__': str(ROOT / 'build_pan-toy.py'), '__name__': 'pan_model', 'RIG_MODE': True}
exec(compile((ROOT / 'build_pan-toy.py').read_text(encoding='utf-8'), str(ROOT / 'build_pan-toy.py'), 'exec'), ns)
import rig_lids
from rig_lids import rot_axis
W, CHIN, HY = ns['W'], ns['CHIN'], ns['HY']
EX, EZ, EHW, EHH, EN = ns['EX'], ns['EZ'], ns['EHW'], ns['EHH'], ns['EN']
MC, MHW = ns['MC'], ns['MHW']
smooth, au, MAT, M2L = ns['smooth'], ns['au'], ns['MAT'], ns['M2L']
head_sdf, front_hit, grad_n = ns['head_sdf'], ns['front_hit'], ns['grad_n']
NOSE_TIP_L = ns['NOSE_TIP_L']
def sm(a, b, x): return float(smooth(a, b, x))
LID_TILT = float(os.environ.get('LID_TILT', '.541'))      # = the eyes' measured outward facing (31.0 deg)
LID_SQ = float(os.environ.get('LID_SQ', '.36'))           # (the game's squint pair, judged in the game: [0.26, -0.26])           # the happy squint the upper lid is designed for (HERO_MODELS squint[0])
LID_B, LID_ZO = float(os.environ.get('LID_B', '.11')), float(os.environ.get('LID_ZO', '-.20'))
LID_LIFT = float(os.environ.get('LID_LIFT', '.0016'))       # the lid's circle passes this far over the skin at the opening's top (under the ledge)
LID_ZLEV, LID_SLOPE = float(os.environ.get('LID_ZLEV', '-.05')), float(os.environ.get('LID_SLOPE', '.06'))
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
head = OBJ['Pan_head']; head.data.calc_loop_triangles()
skin_tree = BVHTree.FromPolygons([v.co[:] for v in head.data.vertices], [tuple(t.vertices) for t in head.data.loop_triangles])
eye_tree = {t: BVHTree.FromPolygons([v.co[:] for v in OBJ['Pan_eye_' + t].data.vertices], [tuple(p.vertices) for p in OBJ['Pan_eye_' + t].data.polygons]) for t in 'LR'}
def ray_y(tree, x, z):
    h = tree.ray_cast(Vector((x, -1.5, z)), Vector((0, 1, 0)), 3)[0]
    return h.y if h is not None else None
LD = rig_lids.Lids(ns, eye_tree)
def hinge(tag): return LD.hinge(tag, LID_TILT)

# ---------------------------------------------------------------- the skeleton (positions in Blender metres)
mouth_y = float(front_hit(0., CHIN + .18 * W)[0]); corner_z = CHIN + .199 * W
P = {'root': (0, -.010, 0), 'hips': (0, -.006, .245), 'spine': (0, -.008, .330), 'chest': (0, -.008, .440), 'neck': (0, -.004, .550),
     'head': (0, .050, CHIN + .006),                                     # the skull base: the nod pivot at the back of the neck
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
    P['thigh_' + tag] = (s * .115, -.004, .228); P['shin_' + tag] = (s * .117, -.008, .150); P['foot_' + tag] = (s * .121, -.014, .072)
TC = np.array(ns['TAIL'][0])
for i, dy in enumerate((0., .022, .040, .054)): P['tail%d' % (i + 1)] = tuple(float(c) for c in TC + np.array([0, dy, 0]))

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
            ok = np.isfinite(ed) & (r[idx] >= ed - .001)             # only vertices in front of the eye there (deep ones sit inside the eyeball, unseen)
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
for tag in 'LR':
    s = 1 if tag == 'L' else -1; k = hinge(tag)
    # ---- upper
    L = LD.upper3(tag, LID_TILT, LID_B, LID_ZO, u_sq=LID_SQ, zlev=LID_ZLEV, slope=LID_SLOPE, sink=-LID_LIFT)
    cols = L['cols']; nc = len(cols)
    rows = [np.array([rot_axis(c_['E'][None], c_['A'], k, -LID_SQ - al)[0] for c_ in cols]) for al in UP_ROWS]
    V = np.array(rows); nr = V.shape[0]; piv = L['Pv']
    Vf, capinfo = cap_radii(V.reshape(-1, 3), piv, k, np.linspace(0, 1.22, 25), tag, (np.linspace(0, 1.22, 13) if os.environ.get('UP_FLOOR', '1') == '1' else ()), nr, nc, keep_rows=2, eye_gap=.0003)
    V = Vf.reshape(nr, nc, 3)
    uv = np.stack(np.meshgrid(L['uu'], UP_ROWS / UP_ROWS[-1]), -1)
    ob = mesh_grid('Pan_lidU_' + tag, V, uv, 'lidU.' + tag, nr, nc); orient_out(ob, piv, k)
    NRM = skin_normals(V.reshape(-1, 3), piv, k, 1.22)
    ob.data.normals_split_custom_set([tuple(NRM[ob.data.loops[l].vertex_index]) for l in range(len(ob.data.loops))])
    lid_objects.append((ob, 'lidU_' + tag)); P['lidU_' + tag] = tuple(float(c) for c in piv)
    LID_PAINT['lidU.' + tag] = dict(V=V, rows=UP_ROWS, uu=L['uu'], Xs=L['Xs'], piv=piv, k=k, tag=tag)
    sc_ = LD.score2(dict(L, V=V)); sc_.pop('worst(a, colX, row, mm, X, Z)', None)
    lid_info['Pan_lidU_' + tag] = {'pivot': [round(float(c), 5) for c in piv], 'cap': capinfo, 'columns(X, r_b_mm, eye_clear_mm, hid_above_mm, hid_below_mm)': L['diag'], **sc_}
    # ---- lower
    Lo = LD.lower(tag, LID_TILT, dz=float(os.environ.get('LOW_DZ', '.5')))
    Vl = np.transpose(Lo['V'], (1, 0, 2)).copy(); nrl, ncl = Vl.shape[0], Vl.shape[1]; pivl = Lo['Pv']
    Vlf, capl = cap_radii(Vl.reshape(-1, 3), pivl, k, (.04, 0., -.05, -.10, -.16, -.20, -.24, -.28), tag, (-.24, -.20), nrl, ncl, margin=.0014)
    Vl = Vlf.reshape(nrl, ncl, 3)
    uvl = np.stack(np.meshgrid((Lo['Xs'] - Lo['Xs'][0]) / (Lo['Xs'][-1] - Lo['Xs'][0]), np.linspace(0, 1, nrl)), -1)
    obl = mesh_grid('Pan_lidD_' + tag, Vl, uvl, 'lidD.' + tag, nrl, ncl); orient_out(obl, pivl, k)
    NRl = skin_normals(Vl.reshape(-1, 3), pivl, k, -.24)
    obl.data.normals_split_custom_set([tuple(NRl[obl.data.loops[l].vertex_index]) for l in range(len(obl.data.loops))])
    lid_objects.append((obl, 'lidD_' + tag)); P['lidD_' + tag] = tuple(float(c) for c in pivl)
    LID_PAINT['lidD.' + tag] = dict(V=Vl, tag=tag)
    lid_info['Pan_lidD_' + tag] = {'pivot': [round(float(c), 5) for c in pivl], 'cap': capl}
print('LIDS', json.dumps(lid_info, default=float), flush=True)

# ---------------------------------------------------------------- lid paint: black (the patch), the lash edge, the shut ribbon
RIB_T = float(os.environ.get('RIB_T', '.013'))         # the shut ribbon's height on the lid (m of arc above the lower rim)
RIB_DIAG = {}
def paint_lids():
    img = next(n.image for n in MAT.node_tree.nodes if n.type == 'TEX_IMAGE')
    w_, h_ = img.size; px = np.empty(w_ * h_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
    rgb, mix = ns['rgb'], ns['mix']
    for chart, info in LID_PAINT.items():
        x0, y0, w, h = ns['CHARTS'][chart]
        U, Vv = np.meshgrid(np.clip((np.arange(w) - 6) / (w - 12), 0, 1), np.clip((np.arange(h) - 6) / (h - 12), 0, 1))
        C = np.broadcast_to(rgb('black'), (h, w, 3)).copy()
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
                C = mix(C, rgb('#0b0a0d'), rib)
                # in the game the black patch renders as one flat dark: the shut eye reads by a light crease along the ribbon's top
                # (the sheet's sleepy face: a dark lash curve with a soft light edge), a fainter one under it
                dA = A_ - (e0 + RIB_T * tp + .0022); crease = (1 - smooth(.0016, .0030, np.abs(dA))) * inside * (.35 + .65 * tp)
                C = mix(C, rgb('#aeaac2'), .95 * crease)
                C = mix(C, rgb('#6e6a80'), .55 * inside * tp * np.exp(-((A_ - (e0 - .0012)) / .0009) ** 2))
        else:
            C = mix(C, rgb('#3c3846'), .55 * np.exp(-((Vv - .03) / .025) ** 2))      # a soft cool crease on the raised edge
            C = mix(C, rgb('lash'), .45 * (1 - smooth(.0, .02, Vv)))
        px[y0:y0 + h, x0:x0 + w, :3] = np.clip(C, 0, 1)
    a8 = np.round(np.clip(px, 0, 1) * 255).astype(np.uint8)
    path = str(ROOT / 'pan-toy_rig_atlas.png')
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
    zm = .175 + .024 * ((t - .5) / .5) ** 2 if t > .5 else .175 + .010 * (1 - t / .5) ** 2
    return CHIN + zm * W
CUT = .94 * MHW
old = head.data; old.calc_loop_triangles(); cn = [Vector(n.vector) for n in old.corner_normals]
oldlab = labels['Pan_head']; uvl = old.uv_layers.active.data
verts = []; vlab = []; vkind = []; faces = []; fuv = []; fno = []; cache = {}; seam = []
def addv(rec, kind):
    co, uv, no, lab = rec
    if kind is None: kind = 'lower' if (lab == 'pan_head_skin' and co.z < smile_z(co.x)) else 'upper'
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
    skin_ = rr[0][3] == 'pan_head_skin'
    cut = skin_ and max(r[0].y for r in rr) < HY - .10 and max(abs(r[0].x) for r in rr) < CUT and min(f) < 0 < max(f)
    if cut: emit(clip(rr, True), 'upper'); emit(clip(rr, False), 'lower')
    else: emit(rr, None)
me = bpy.data.meshes.new('Pan_head_parted'); me.from_pydata(verts, [], faces); me.update()
layer = me.uv_layers.new(name='Atlas')
for poly, uu in zip(me.polygons, fuv):
    poly.use_smooth = True
    for l, u in zip(poly.loop_indices, uu): layer.data[l].uv = u
FV = np.array([verts[i] for f in faces for i in f]); FN = np.array([n for nn in fno for n in nn])
FL = [vlab[i] for f in faces for i in f]
onsk = (np.abs(head_sdf(FV)) < .0003) & np.array([l_ == 'pan_head_skin' for l_ in FL])
FN[onsk] = grad_n(FV[onsk])
me.normals_split_custom_set([tuple(n) for n in FN]); me.materials.append(MAT)
head.data = me; labels['Pan_head'] = vlab
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
    if lab == 'pear_torso':
        hips = 1 - sm(.235, .300, z); chest = sm(.380, .460, z); top = sm(.540, .590, z)
        arm = .22 * sm(.10, .15, abs(x)) * sm(.44, .50, z) * (1 - top)
        thigh = .25 * sm(.05, .10, abs(x)) * (1 - sm(.17, .215, z))       # the belly's underside over the legs follows them a little
        w = {'hips': hips * (1 - top) * (1 - thigh), 'thigh_' + side: hips * (1 - top) * thigh,
             'spine': (1 - hips) * (1 - chest) * (1 - top), 'chest': (1 - hips) * chest * (1 - top) * (1 - arm),
             'upperarm_' + side: (1 - hips) * chest * (1 - top) * arm, 'neck': .65 * top, 'head': .35 * top}
        return w
    if lab in ('scarf_roll', 'scarf_knot'):
        r = sm(.575, .610, z); return {'chest': .70 - .30 * r, 'neck': .30 + .10 * r, 'head': .20 * r}
    if lab.startswith('scarf_end'): return {'chest': 1.}
    if lab.startswith('arm.'):
        t = float((np.array(p) - np.array(ARMS[side]['shoulder'])) @ ARM_D[side]); Lw = ARM_LEN[side]
        fore = sm(.42 * Lw, .62 * Lw, t); hand = sm(.88 * Lw, 1.0 * Lw, t); chest = .25 * (1 - sm(-.04, .03, t))
        return {'chest': chest, 'upperarm_' + side: (1 - chest) * (1 - fore), 'forearm_' + side: (1 - chest) * fore * (1 - hand),
                'hand_' + side: (1 - chest) * fore * hand}
    if lab.startswith('big_foot'): return {'foot_' + side: 1.}
    if lab.startswith('leg.'):
        hips = sm(.255, .300, z); shin = 1 - sm(.125, .180, z); foot = 1 - sm(.055, .085, z)
        return {'hips': hips, 'thigh_' + side: (1 - hips) * (1 - shin), 'shin_' + side: (1 - hips) * shin * (1 - foot), 'foot_' + side: (1 - hips) * shin * foot}
    if lab == 'round_tail': return {'tail1': 1.}
    raise KeyError(lab)
def ear_weights(p, s):
    E = ns['ear_info'][s]; tag = 'L' if s > 0 else 'R'; up_ = E['R'][:, 2]; r = ns['EAR']['r'] * W
    hz = float((np.asarray(p) - E['base']) @ up_) / (float((E['C'] - E['base']) @ up_) + r)     # 0 at the base .. 1 at the top
    tip = sm(.45, .85, hz); return {'ear_' + tag: 1 - tip, 'earTip_' + tag: tip}

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
adata = bpy.data.armatures.new('Pan_game_skeleton'); arm = bpy.data.objects.new('Pan_Rig', adata); bpy.context.collection.objects.link(arm)
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
            ww = face_weights((x, y, z), 'pan_head_skin', level)
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
mouth = make_mesh('Pan_mouth_cavity', cav_v, cav_f, 'cavity')
bm = bmesh.new(); bm.from_mesh(mouth.data)
cc = Vector((0, rim[len(rim) // 2][1] + .03, MC))
for f in bm.faces:
    if f.normal.dot(f.calc_center_median() - cc) > 0: f.normal_flip()        # faces look into the pocket
bm.to_mesh(mouth.data); bm.free()
ty = rim[len(rim) // 2][1] + .030; TC_ = np.array([0, ty, CHIN + .150 * W]); TR_ = np.array([.055, .040, .011]) * W
tv = []; tf = []; nseg, nrng = 14, 8
for j in range(nrng + 1):
    ph = math.pi * j / nrng
    for i in range(nseg): a = 2 * math.pi * i / nseg; tv.append(tuple(TC_ + TR_ * np.array([math.sin(ph) * math.cos(a), math.sin(ph) * math.sin(a), -math.cos(ph)])))
for j in range(nrng):
    for i in range(nseg): tf.append((j * nseg + i, j * nseg + (i + 1) % nseg, (j + 1) * nseg + (i + 1) % nseg, (j + 1) * nseg + i))
tongue = make_mesh('Pan_tongue', tv, tf, 'tongue')
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
    if o.name == 'Pan_head': weights = [face_weights(p, l, k_) for p, l, k_ in zip(pp, lab, vkind)]
    elif o.name.startswith('Pan_eye_'): weights = [{'eye_' + o.name[-1]: 1} for p in pp]
    elif o.name.startswith('Pan_ear_'): weights = [ear_weights(p, 1 if o.name[-1] == 'L' else -1) for p in pp]
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
hidden['Pan_tongue@rest'] = {'max_sdf_mm': round(float(sd.max()) * 1000, 2), 'outside_count': int((sd > -.0005).sum())}
print('HIDDEN', json.dumps(hidden), flush=True)
def proud_sweep(o, bname):
    tag = bname[-1]; piv = np.array(P[bname]); V = np.array([list(v.co) for v in o.data.vertices]); out = {}
    angs = np.round(np.linspace(0, 1.22, 13), 3) if bname.startswith('lidU') else np.round([0., -.10, -.18, -.24, -.30], 3)
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
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'pan-toy_rig.blend'))
rig = {'bones': [{'name': b, 'parent': PARENT[b], 'head_blender_m': [round(float(c), 5) for c in P[b]]} for b in HERO],
       'triangles': total, 'lidTilt': LID_TILT, 'squint_designed_for': [LID_SQ, -.24],
       'lid_hinge_blender': {t: [round(float(v), 5) for v in hinge(t)] for t in 'LR'}, 'lids': lid_info, 'lids_hidden_check': hidden,
       'happy_edge_screen': EDGES, 'proud_outside_opening(count, max_mm)': PROUD, 'ribbon': RIB_DIAG, **LOG, 'objects': {o.name: len(o.data.loop_triangles) for o in objects},
       'notes': ['Game axes: X = Blender +X, Y = Blender +Z, Z = Blender -Y; pose bones use YZX Euler = three.js XYZ.',
                 'Head pivot at the skull base (back of the neck, chin height), not the head centre.',
                 'Lids turn about the tilted hinge (cos t, +-sin t, 0) through their bone head (HERO_MODELS lidTilt = t).',
                 'The skin eye hole is the visible opening under the rest lid; the approved lash ledge + wing are static head geometry;'
                 ' the moving upper lid is hidden at rest (lidU 0) and closes at 1.22.']}
(ROOT / 'joints-rig.json').write_text(json.dumps(rig, indent=2, default=float))
print('PAN_RIG', json.dumps({'bones': len(HERO), 'triangles': total}), flush=True)
