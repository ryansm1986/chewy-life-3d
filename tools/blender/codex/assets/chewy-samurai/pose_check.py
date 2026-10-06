"""Poke-through check on the posed rig (the same game rotations as render_poses.py): triangle-pair overlaps between
cloth and body groups in every pose, against the rest pose. A count above rest = new intersection in that pose.
    blender --background --factory-startup --python pose_check.py   -> pose-check.json
"""
import bpy, json, os, math, sys
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
T = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(T, 'chewy-samurai_rig.blend'))
arm = bpy.data.objects['Chewy_Rig']; arm.data.pose_position = 'POSE'
labels = json.load(open(os.path.join(T, 'rig-part-labels.json')))['Chewy_body']
src = open(os.path.join(T, 'render_poses.py'), encoding='utf-8').read()
POSES = eval(src[src.index('POSES = [') + 8: src.index(']\nFACE')] + ']')
POSES.append(('tail-idle', 'TAIL WAG -0.35 (IDLE)', {'tail1': (-.15, -.35, 0)}, True))
POSES.insert(2, ('walk-game-b', 'WALK AT THE GAME AMPLITUDE 0.62 B', {'thigh_L': (-.62, 0, 0), 'thigh_R': (.62, 0, 0), 'upperarm_L': (.55, 0, .12), 'upperarm_R': (-.55, 0, -.12), 'spine': (.1, 0, -.05)}, True))
NEUTRAL = {'upperarm_L': (0, 0, .12), 'upperarm_R': (0, 0, -.12), 'lidD_L': (-.1, 0, 0), 'lidD_R': (-.1, 0, 0)}
body = bpy.data.objects['Chewy_body']; head = bpy.data.objects['Chewy_head']; tail = bpy.data.objects['Chewy_tail']
me0 = body.data; polys = [tuple(p.vertices) for p in me0.polygons]
lab = np.array(labels)
def grp(prefixes):
    return np.array([l.startswith(prefixes) for l in labels])
G = {'haori': grp(('haori_body', 'haori_collar_band')), 'sleeve.L': grp(('box_sleeve.L',)), 'sleeve.R': grp(('box_sleeve.R',)),
     'arm.L': grp(('upper_arm_skin.L', 'thick_forearm_wrap.L', 'wrist_skin.L', 'large_mitten_paw.L', 'short_thumb_bump.L')),
     'arm.R': grp(('upper_arm_skin.R', 'thick_forearm_wrap.R', 'wrist_skin.R', 'large_mitten_paw.R', 'short_thumb_bump.R')),
     'hakama.L': grp(('hakama_leg.L',)), 'hakama.R': grp(('hakama_leg.R',)), 'saya': grp(('saya_', 'sageo_')),
     'feet': grp(('broad_dog_foot', 'ankle')), 'kimono': grp(('kimono_',)), 'waistband': grp(('hakama_waistband',)), 'cord': grp(('himo_',))}
PAIRS = [('sleeve.L', 'arm.L'), ('sleeve.R', 'arm.R'), ('haori', 'arm.L'), ('haori', 'arm.R'), ('haori', 'hakama.L'), ('haori', 'hakama.R'),
         ('hakama.L', 'hakama.R'), ('saya', 'hakama.L'), ('saya', 'arm.L'), ('saya', 'haori'), ('hakama.L', 'feet'), ('hakama.R', 'feet'),
         ('haori', 'TAIL'), ('haori', 'HEAD'), ('sleeve.L', 'HEAD'), ('sleeve.R', 'HEAD'), ('kimono', 'HEAD'), ('cord', 'HEAD'), ('sleeve.L', 'haori'), ('sleeve.R', 'haori'), ('arm.L', 'HEAD'), ('arm.R', 'HEAD'), ('arm.L', 'kimono'), ('arm.R', 'kimono'), ('arm.L', 'saya'), ('haori', 'waistband'), ('haori', 'kimono')]
def pose(ch):
    for b in arm.pose.bones: b.matrix_basis = Matrix.Identity(4); b.location = (0, 0, 0)
    arm.location = (0, 0, 0)
    for name, v in ch.items():
        if name == 'root_y': arm.location = (0, 0, v); continue
        gx, gy, gz = v
        arm.pose.bones[name].matrix_basis = Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
    bpy.context.view_layer.update()
def evaluated(o):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh()
    V = np.array([tuple(e.matrix_world @ v.co) for v in m.vertices]); F = [tuple(p.vertices) for p in m.polygons]; e.to_mesh_clear(); return V, F
# outer (visible) cloth faces, by atlas region: the haori, sleeve, collar and hakama charts (inner walls use swatches)
uvl = me0.uv_layers.active.data
def in_rect(u, v, r): x, y, w, h = r; return x <= u * 2048 <= x + w and y <= v * 2048 <= y + h
OUTER_RECTS = [(1024, 1024, 1024, 512), (512, 768, 512, 256), (512, 704, 256, 64), (0, 640, 512, 384)]
# cloth outer faces for the fur test: haori, sleeves, collar band, hakama legs, the kimono front and the waistband
CLOTH_RECTS = OUTER_RECTS + [(512, 256, 512, 256), (0, 512, 512, 128)]
FUR = ('broad_dog_foot', 'ankle', 'large_mitten_paw', 'short_thumb_bump', 'wrist_skin', 'upper_arm_skin', 'visible_neck_blaze')
outer_face = np.array([any(in_rect(uvl[p.loop_start].uv.x, uvl[p.loop_start].uv.y, r) for r in OUTER_RECTS) for p in me0.polygons])
CLOTH = ('haori', 'sleeve.L', 'sleeve.R', 'hakama.L', 'hakama.R')
cloth_face = np.array([any(in_rect(uvl[p.loop_start].uv.x, uvl[p.loop_start].uv.y, r) for r in CLOTH_RECTS) for p in me0.polygons])
fur_vert = np.array([l.startswith(FUR) for l in labels])
fur_faces = [k for k, f in enumerate(polys) if all(fur_vert[i] for i in f)]
cloth_faces = [k for k, f in enumerate(polys) if cloth_face[k] and not any(fur_vert[i] for i in f)]
fur_part = {k: labels[polys[k][0]] for k in fur_faces}
cloth_part = {k: labels[polys[k][0]] for k in cloth_faces}
fur_rest_x = {k: float(np.mean([me0.vertices[i].co.x for i in polys[k]])) for k in fur_faces}
tail_rest = np.array([tuple(v.co) for v in tail.data.vertices]); tail_polys = [tuple(p.vertices) for p in tail.data.polygons]
tail_rest_y = np.array([tail_rest[list(f)][:, 1].mean() for f in tail_polys])
def classify(fur, cloth, kind, k):
    """'visible' = fur showing through cloth; 'covered' = an approved junction hidden by another layer."""
    if kind == 'tail':
        return 'covered' if tail_rest_y[k] < .215 else 'visible'          # the root inside the seat and vent vs the tail outside
    if fur.startswith('upper_arm_skin') and cloth.startswith(('haori_body', 'haori_collar_band')):
        return 'covered'                                                    # the arm root under the sleeve
    if fur.startswith('upper_arm_skin') and cloth.startswith('kimono_front') and abs(fur_rest_x[k]) > .13:
        return 'covered'                                                    # under the haori front panel and the sleeve
    return 'visible'
def fur_through(V, F, Vt, Ft):
    ftree = BVHTree.FromPolygons([Vector(p) for p in V], [F[k] for k in fur_faces])
    ctree = BVHTree.FromPolygons([Vector(p) for p in V], [F[k] for k in cloth_faces])
    hits = {}
    for i, j in ftree.overlap(ctree):
        k = fur_faces[i]; c = cloth_part[cloth_faces[j]]; hits[('body', k)] = classify(fur_part[k], c, 'body', k) if hits.get(('body', k)) != 'visible' else 'visible'
        hits[('body', k, 'with')] = c
    ttree = BVHTree.FromPolygons([Vector(p) for p in Vt], Ft)
    for i, j in ttree.overlap(ctree):
        hits[('tail', i)] = classify('tail', cloth_part[cloth_faces[j]], 'tail', i); hits[('tail', i, 'with')] = cloth_part[cloth_faces[j]]
    return hits
FUR_REST = None
def tree(V, F, mask=None, outer=False):
    if mask is None: return BVHTree.FromPolygons([Vector(p) for p in V], F)
    keep = [f for k, f in enumerate(F) if all(mask[i] for i in f) and (not outer or outer_face[k])]
    return BVHTree.FromPolygons([Vector(p) for p in V], keep)
res = {}; LOC = {}; FURCOUNT = {}; FURLOC = {}
for key, label, ch, neutral in POSES:
    c = dict(NEUTRAL) if neutral else {}; c.update(ch); pose(c)
    V, F = evaluated(body); Vh, Fh = evaluated(head); Vt, Ft = evaluated(tail)
    trees = {k: tree(V, F, m, k in CLOTH) for k, m in G.items()}; trees['HEAD'] = tree(Vh, Fh); trees['TAIL'] = tree(Vt, Ft)
    hits = fur_through(V, F, Vt, Ft)
    tri = {k: v for k, v in hits.items() if len(k) == 2}
    if FUR_REST is None: FUR_REST = set(tri)
    new = sorted(set(tri) - FUR_REST)
    out_ = {'visible': {}, 'covered': {}}; locs = {}
    for kind, k in new:
        nm = 'thick_curled_tail' if kind == 'tail' else fur_part[k].split('.')[0]
        cls = tri[(kind, k)]; w = hits[(kind, k, 'with')].split('.')[0]
        key2 = nm + ' x ' + w; out_[cls][key2] = out_[cls].get(key2, 0) + 1
        c = (Vt if kind == 'tail' else V)[list((Ft if kind == 'tail' else F)[k])].mean(0)
        locs.setdefault(cls + ' ' + key2, []).append(c)
    FURLOC[key] = {n: {'min': np.array(v).min(0).round(3).tolist(), 'max': np.array(v).max(0).round(3).tolist()} for n, v in locs.items()}
    FURCOUNT[key] = {'visible_fur_through_cloth': sum(out_['visible'].values()), 'covered_junction_triangles': sum(out_['covered'].values()),
                     'visible_by_pair': out_['visible'], 'covered_by_pair': out_['covered']}
    res[key] = {}; LOC.setdefault(key, {})
    for a_, b_ in PAIRS:
        ov = trees[a_].overlap(trees[b_]); res[key][a_ + '|' + b_] = len(ov)
        if ov and a_ in CLOTH:
            Fa = [f for k, f in enumerate(F) if all(G[a_][i] for i in f) and outer_face[k]]
            C = np.array([V[list(Fa[i])].mean(0) for i, _ in ov])
            LOC[key][a_ + '|' + b_] = {'min': C.min(0).round(3).tolist(), 'max': C.max(0).round(3).tolist(), 'mean': C.mean(0).round(3).tolist()}
rest = res['rest']
report = {'fur_through_cloth': FURCOUNT, 'fur_through_cloth_locations': FURLOC,
          'fur_through_cloth_rest_baseline_triangles': len(FUR_REST),
          'fur_through_cloth_rule': 'visible = fur triangles newly crossing outer cloth faces (feet, ankles, paws, thumbs, wrists, the tail beyond the vent, the neck blaze; the upper arm through a sleeve). covered = the arm root crossing the haori under its sleeve, the tail root inside the seat and vent (y < 0.215 at rest).',
          'fur_through_cloth_note': 'fur triangles (feet, ankles, paws, thumbs, wrists, upper arms, neck blaze, tail) crossing outer cloth faces, new compared with rest; rest has the approved hidden contacts (arm roots inside the sleeves, tail root in the seat)',
          'locations': LOC, 'rest_baseline': rest, 'new_overlaps_vs_rest': {k: {p: n - rest[p] for p, n in v.items() if n > rest[p]} for k, v in res.items()}, 'all': res}
json.dump(report, open(os.path.join(T, 'pose-check.json'), 'w'), indent=1)
print('FUR_THROUGH_CLOTH', json.dumps({k: [v['visible_fur_through_cloth'], v['covered_junction_triangles']] for k, v in FURCOUNT.items()}))
print('POSE_CHECK', json.dumps(report['new_overlaps_vs_rest']))
print('REST', json.dumps(rest))
