"""Shadow's whelp outfit, phase 2: the rig, on the game's 21-bone quad contract (hero_export.py --contract quad).

    blender --background --factory-startup --python rig_shadow-whelp.py

1. Runs the archived Shadow rig (base/rig_shadow-toy.py, MD5-checked against the archive) unchanged, up to its .blend save:
   his build, smile cut, mouth pocket, tongue, lid shells, the 21-bone skeleton and every weight, exactly as shipped.
2. Runs sections 1-4 of build_shadow-whelp.py in rig mode inside that scene: the approved costume, the 2048 x 2304 atlas
   (the rig's own 2048 rows, with its lid / mouth / tongue patches, plus the costume rows) and the v rescale of every rig
   mesh's UVs.
3. Weights the costume (<= 4 influences, quantized to 255 by the rig's own bind()):
   - hood: head; over its last 4 cm above the collar (behind the face edge) it copies the skin under it, the head skin or the
     neck skin and collar (the collar's own neck band), whichever is nearer; the ear piping, horns and spikes are rigid head;
   - coat and bib: the skin's own weights, interpolated on the body / leg triangle of Shadow_body straight under each vertex
     (not the collar or the tag); the coat spikes are rigid at their base's skin weights;
   - tail cover: body, tail1 and tail2 on the stub tail's own falloff along the tail axis (the quad contract has only two
     tail bones); the tail spikes are rigid at their base's weights.
4. Saves shadow-whelp_rig.blend and rig-whelp.json. The wings stay separate props (wing_mount.json).
"""
import bpy, bmesh, math, json, os, sys, hashlib
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

TASK = os.path.dirname(os.path.abspath(__file__))
RIG = os.path.join(TASK, 'base', 'rig_shadow-toy.py')
RIG_ARCHIVE = 'D:/projects/chewy-life-3d/tools/blender/codex/assets/shadow-toy/rig_shadow-toy.py'
RIG_MD5 = hashlib.md5(open(RIG, 'rb').read()).hexdigest()
assert RIG_MD5 == hashlib.md5(open(RIG_ARCHIVE, 'rb').read()).hexdigest(), 'base/rig_shadow-toy.py differs from the archive'
os.makedirs(os.path.join(TASK, 'base', 'scratch'), exist_ok=True)          # (the archived rig writes scratch/open_pts.json)

# ================================================================== 1. the archived Shadow rig, unchanged up to its save
rsrc = open(RIG, 'rb').read().decode('utf-8')
cut = rsrc.index("bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'shadow-toy_rig.blend'))")
R = {'__file__': RIG, '__name__': 'shadow_rig'}
exec(compile(rsrc[:cut], RIG, 'exec'), R)
print('SHADOW_RIG_DONE', RIG_MD5, flush=True)
ns = R['ns']; arm = R['arm']; bind = R['bind']; neck_band = R['neck_band']; sm = R['sm']
sstep = ns['sstep']
SHADOW_MESHES = list(R['meshes'])

# ================================================================== 2. the approved costume, in rig mode
WB = os.path.join(TASK, 'build_shadow-whelp.py')
wsrc = open(WB, 'rb').read().decode('utf-8')
wsrc = wsrc[:wsrc.index('# ================================================================== 5. records')]
Wg = {'__file__': WB, '__name__': 'whelp_costume', 'WHELP_MODE': 'rig', 'WHELP_NS': ns,
      'WHELP_BASE_ATLAS': R['atlas'], 'WHELP_UV_OBJECTS': SHADOW_MESHES}
exec(compile(wsrc, WB, 'exec'), Wg)
COSTUME = Wg['COSTUME']; AW, AH, CH, G = Wg['AW'], Wg['AH'], Wg['CH'], Wg['G']
CONE_LIST = Wg['CONE_LIST']
for o in COSTUME.values():
    o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)
bpy.context.view_layer.update()
print('COSTUME_DONE', {k: len(o.data.vertices) for k, o in COSTUME.items()}, flush=True)

# ================================================================== 3. costume weights
def vert_charts(o):
    me = o.data; nl = len(me.loops)
    lv = np.empty(nl, np.int64); me.loops.foreach_get('vertex_index', lv)
    uv = np.empty(nl * 2); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    vu = np.zeros((len(me.vertices), 2)); vu[lv] = uv
    px, py = vu[:, 0] * AW, vu[:, 1] * AH
    chart = np.full(len(me.vertices), '', dtype=object)
    for k, (x, y, w, h) in CH.items():
        m = (px >= x) & (px < x + w) & (py >= y) & (py < y + h); chart[m] = k
    assert (chart != '').all(), (o.name, 'vertices outside the costume charts')
    cone = np.full(len(me.vertices), -1)
    b = chart == 'brass'
    ul = (px[b] - CH['brass'][0] - G) / (CH['brass'][2] - 2 * G)
    cone[b] = np.clip(np.floor(ul * len(CONE_LIST)), 0, len(CONE_LIST) - 1).astype(int)
    return chart, cone
# --- the skin's own weights (barrel and legs of Shadow_body), interpolated over its nearest triangle
body = R['body']; blab = R['labels']['Shadow_body']
gname = {g.index: g.name for g in body.vertex_groups}
BW = [{gname[g.group]: g.weight for g in v.groups} for v in body.data.vertices]
SKIN_LABELS = ('body', 'leg.FL', 'leg.FR', 'leg.BL', 'leg.BR')
body.data.calc_loop_triangles()
BV = np.array([tuple(v.co) for v in body.data.vertices])
tris = [tuple(t.vertices) for t in body.data.loop_triangles if all(blab[i] in SKIN_LABELS for i in t.vertices)]
skin_bvh = BVHTree.FromPolygons([Vector(p) for p in BV], tris)
def copy_skin(p, n=None):
    """the skin's weights straight under p (a ray along -n; the hem's tuck rows, under the skin, look along +n), else nearest"""
    hit = None
    if n is not None:
        n_ = Vector(n).normalized()
        for d_ in (-n_, n_):
            h_ = skin_bvh.ray_cast(Vector(p), d_, 0.03)
            if h_[0] is not None and (hit is None or h_[3] < hit[3]): hit = h_
    if hit is None: loc, nrm_, idx, dist = skin_bvh.find_nearest(Vector(p))
    else: loc, nrm_, idx, dist = hit
    a, b, c = (BV[i] for i in tris[idx]); q = np.array(loc)
    v0, v1, v2 = b - a, c - a, q - a
    d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01
    l1 = (d11 * d20 - d01 * d21) / den; l2 = (d00 * d21 - d01 * d20) / den; l0 = 1 - l1 - l2
    w = {}
    for lam, vi in zip((l0, l1, l2), tris[idx]):
        for k_, v_ in BW[vi].items(): w[k_] = w.get(k_, 0.0) + max(lam, 0.0) * v_
    s = sum(w.values()); return {k_: v_ / s for k_, v_ in w.items()}
# --- the hood: head; over its nape band it copies the skin under it (the head skin, or the neck skin and the collar, whichever
# is nearer), so the hem rides the collar's own neck band and the part over his skull rides the head
Zcoll, Yf = Wg['Zcoll'], Wg['Yf']
def skin_sampler(o, keep=None):
    lab_ = R['labels'].get(o.name)
    gn = {g.index: g.name for g in o.vertex_groups}
    Wv = [{gn[g.group]: g.weight for g in v.groups} for v in o.data.vertices]
    o.data.calc_loop_triangles(); V_ = np.array([tuple(v.co) for v in o.data.vertices])
    T_ = [tuple(t.vertices) for t in o.data.loop_triangles if keep is None or all(lab_[i] in keep for i in t.vertices)]
    bvh = BVHTree.FromPolygons([Vector(q) for q in V_], T_)
    def sample(p):
        loc, nrm_, idx, dist = bvh.find_nearest(Vector(p))
        a_, b_, c_ = (V_[i] for i in T_[idx]); q = np.array(loc)
        v0, v1, v2 = b_ - a_, c_ - a_, q - a_
        d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
        den = d00 * d11 - d01 * d01; l1 = (d11 * d20 - d01 * d21) / den; l2 = (d00 * d21 - d01 * d20) / den
        w = {}
        for lam, vi in zip((1 - l1 - l2, l1, l2), T_[idx]):
            for k_, v_ in Wv[vi].items(): w[k_] = w.get(k_, 0.0) + max(lam, 0.0) * v_
        s_ = sum(w.values()); return dist, {k_: v_ / s_ for k_, v_ in w.items()}
    return sample
head_skin = skin_sampler(R['head'])
neck_skin = skin_sampler(body, keep=SKIN_LABELS + ('collar',))
def hood_w(p):
    x, y, z = (float(c) for c in p); ztop = float(Zcoll(y)) + 0.0177
    t = float(sstep(ztop + 0.045, ztop + 0.008, z)) * float(sstep(0.0, 0.05, y - float(Yf(z))))
    if t <= 0: return {'head': 1.0}
    dh, wh = head_skin(p); db, wb = neck_skin(p)
    lam = float(sstep(-0.004, 0.004, db - dh))                    # 1: the head skin is the nearer one
    w = {'head': 1 - t}
    for src_, f_ in ((wh, t * lam), (wb, t * (1 - lam))):
        for k_, v_ in src_.items(): w[k_] = w.get(k_, 0.0) + f_ * v_
    return w
# --- the tail cover: the stub tail's own falloff along the tail axis
TR, TA = np.asarray(R['TAIL_ROOT']), np.asarray(R['TAIL_AX'])
def tail_w(p):
    sx = float(np.dot(np.asarray(p) - TR, TA))
    wb = 1 - sm(-0.012, 0.010, sx); w2 = sm(0.018, 0.045, sx) * (1 - wb)
    return {'body': wb, 'tail2': w2, 'tail1': 1 - wb - w2}
RULE = {'Whelp_hood': hood_w, 'Whelp_coat': copy_skin, 'Whelp_tail': tail_w}
STATS = {}
for name, o in COSTUME.items():
    chart, cone = vert_charts(o)
    cone_w = {}
    W = []
    for v, ch, k in zip(o.data.vertices, chart, cone):
        p = np.array(v.co)
        if ch == 'brass':                                        # horns and spikes: rigid at their base
            if k not in cone_w: cone_w[k] = RULE[name](CONE_LIST[k][1].mean(0))
            W.append(dict(cone_w[k]))
        elif ch == 'cuff': W.append({'head': 1.0})               # the ear piping: rigid with the head
        elif name == 'Whelp_coat': W.append(copy_skin(p, np.array(v.normal)))   # the coat and bib: the skin straight under them
        else: W.append(RULE[name](p))
    bind(o, W)
    dom = {}
    for w in W:
        b_ = max(w, key=w.get); dom[b_] = dom.get(b_, 0) + 1
    STATS[name] = {'vertices': len(W), 'dominant_bone_counts': dom, 'charts': {c: int((chart == c).sum()) for c in set(chart)}}
    print('BOUND', name, json.dumps(dom), flush=True)

# ================================================================== 4. checks, save
meshes = SHADOW_MESHES + list(COSTUME.values())
tri = 0
for o in meshes:
    o.data.calc_loop_triangles(); tri += len(o.data.loop_triangles)
    assert len(o.modifiers) == 1 and o.modifiers[0].type == 'ARMATURE' and o.modifiers[0].object == arm, o.name
    assert o.parent == arm, o.name
    for v in o.data.vertices:
        assert 1 <= len(v.groups) <= 4 and abs(sum(g.weight for g in v.groups) - 1) < 2e-3, (o.name, v.index)
        assert all(math.isfinite(c) for c in v.co)
STATS['triangles_total'] = tri
STATS['triangles_shadow'] = sum(len(o.data.loop_triangles) for o in SHADOW_MESHES)
STATS['triangles_costume'] = sum(len(o.data.loop_triangles) for o in COSTUME.values())
# the rest pose must be the approved model: the evaluated costume equals its rest mesh
arm.data.pose_position = 'POSE'
for pb in arm.pose.bones: pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get(); dmax = 0.0
for o in meshes:
    e = o.evaluated_get(dg); m = e.to_mesh()
    A_ = np.array([tuple(e.matrix_world @ v.co) for v in m.vertices]); B_ = np.array([tuple(v.co) for v in o.data.vertices])
    dmax = max(dmax, float(np.abs(A_ - B_).max())); e.to_mesh_clear()
STATS['rest_pose_max_delta_m'] = dmax
print('RIG_TRIANGLES', tri, 'rest delta', dmax, flush=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TASK, 'shadow-whelp_rig.blend'))
info = {'base_rig_md5': RIG_MD5, 'bones': [{'name': b, 'parent': R['PARENT'][b], 'head_blender_m': [round(float(c), 5) for c in R['P'][b]]} for b in R['BONES']],
        'axes': 'identity rest orientations (as shadow_toy): pose rotations are world-axis rotations about each bone head; game XYZ = Blender X, Z, -Y',
        'shadow_rig_stats': R['STATS'], 'costume': STATS,
        'weights': {'Whelp_hood': 'head; the nape band (last 4 cm above the collar, behind the face edge) copies the nearer skin: head skin, or neck skin and collar (the collar neck band); piping, horns, spikes rigid head',
                    'Whelp_coat': "coat and bib: Shadow_body's own skin weights at the nearest barrel / leg triangle; spikes rigid at their base",
                    'Whelp_tail': 'body / tail1 / tail2 on the stub tail falloff along the tail axis; spikes rigid at their base'}}
json.dump(info, open(os.path.join(TASK, 'rig-whelp.json'), 'w', encoding='utf-8'), indent=1)
print('WHELP_RIG_DONE', json.dumps({'triangles': tri, 'meshes': len(meshes)}), flush=True)
