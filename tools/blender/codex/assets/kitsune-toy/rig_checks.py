"""Numeric pose checks for kitsune-toy_rig.blend (posed exactly as the game drives the joints, like rig_tests.py).

    blender --background --factory-startup --python rig_checks.py

- ears: for each ear swing (ear_L/R +-0.35 Z with +-0.3 X), the ear vertices inside the deformed head (ray parity) minus those inside
  at rest (the root rows are buried by design), and the deepest new penetration in mm;
- tail: for each wag (tail1-4 each +-0.25 Y), the tail vertices that are inside the hakama's thick shell (poke-through) beyond rest;
- legs: walk and run, the thigh / shin vertices outside the hakama's outer surface below the sash (a leg through the cloth).
Writes scratch/rig_checks.json.
"""
import bpy, json, os, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
ROOT = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'kitsune-toy_rig.blend'))
arm = bpy.data.objects['Kitsune_Rig']; arm.data.pose_position = 'POSE'; PB = arm.pose.bones
def pose(ch):
    for b in PB: b.matrix_basis = Matrix.Identity(4)
    for name, (gx, gy, gz) in ch.items():
        PB[name].matrix_basis = Matrix.Rotation(gx, 4, 'X') @ Matrix.Rotation(gy, 4, 'Z') @ Matrix.Rotation(-gz, 4, 'Y')
    bpy.context.view_layer.update()
def verts(name):
    o = bpy.data.objects[name]; dg = bpy.context.evaluated_depsgraph_get(); oe = o.evaluated_get(dg); me = oe.to_mesh()
    V = np.array([list(o.matrix_world @ v.co) for v in me.vertices]); me.calc_loop_triangles(); T = [tuple(t.vertices) for t in me.loop_triangles]
    oe.to_mesh_clear(); return V, T
def inside(V, tree):
    out = np.zeros(len(V), bool)
    for i, p in enumerate(V):
        n = 0; o = Vector(p); d = Vector((0.0123, 0.0071, 1.0)).normalized()
        while True:
            h = tree.ray_cast(o, d, 5)
            if h[0] is None: break
            n += 1; o = h[0] + d * 1e-5
            if n > 40: break
        out[i] = n % 2 == 1
    return out
def depth(V, tree):
    return np.array([tree.find_nearest(Vector(p))[3] or 0. for p in V])
R = {}
pose({}); HV, HT = verts('Kitsune_head'); htree = BVHTree.FromPolygons([Vector(p) for p in HV], HT)
rest_in = {t: inside(verts('Kitsune_ear_' + t)[0], htree) for t in 'LR'}
for key, ch in (('ears +Z +X', {'ear_L': (.3, 0, .35), 'ear_R': (.3, 0, -.35)}), ('ears -Z -X', {'ear_L': (-.3, 0, -.35), 'ear_R': (-.3, 0, .35)}),
                ('ears +Z -X', {'ear_L': (-.3, 0, .35), 'ear_R': (-.3, 0, -.35)}), ('ears -Z +X', {'ear_L': (.3, 0, -.35), 'ear_R': (.3, 0, .35)})):
    pose(ch); HV, HT = verts('Kitsune_head'); ht = BVHTree.FromPolygons([Vector(p) for p in HV], HT); r = {}
    for t in 'LR':
        EV, _ = verts('Kitsune_ear_' + t); ins = inside(EV, ht); new = ins & ~rest_in[t]
        r[t] = {'new_inside': int(new.sum()), 'deepest_new_mm': round(float(depth(EV[new], ht).max() * 1000), 1) if new.any() else 0.}
    R[key] = r
pose({}); SV, ST = verts('Kitsune_skirt'); stree = BVHTree.FromPolygons([Vector(p) for p in SV], ST)
TV, _ = verts('Kitsune_tail'); tail_rest = inside(TV, stree)
for key, ch in (('tail +0.25', {f'tail{i}': (0, .25, 0) for i in range(1, 5)}), ('tail -0.25', {f'tail{i}': (0, -.25, 0) for i in range(1, 5)})):
    pose(ch); SV, ST = verts('Kitsune_skirt'); st = BVHTree.FromPolygons([Vector(p) for p in SV], ST); TV, _ = verts('Kitsune_tail')
    ins = inside(TV, st); new = ins & ~tail_rest; gone = tail_rest & ~ins
    R[key] = {'tail_verts_newly_in_the_hakama_shell': int(new.sum()), 'deepest_mm': round(float(depth(TV[new], st).max() * 1000), 1) if new.any() else 0.,
              'rest_in_shell': int(tail_rest.sum()), 'left_the_shell': int(gone.sum())}
# legs through the hakama: leg (fur_leg) vertices below z 0.30 that end up outside the hakama's outer sheet (seen from outside)
LEGV = lambda: verts('Kitsune_body')
for key, ch in (('walk', {'thigh_L': (.62, 0, 0), 'thigh_R': (-.62, 0, 0)}), ('run', {'thigh_L': (1.0, 0, 0), 'thigh_R': (-1.0, 0, 0), 'spine': (.26, 0, 0)}),
                ('run-b', {'thigh_L': (-1.0, 0, 0), 'thigh_R': (1.0, 0, 0), 'spine': (.26, 0, 0)})):
    pose(ch); SV, ST = verts('Kitsune_skirt'); st = BVHTree.FromPolygons([Vector(p) for p in SV], ST)
    BV, _ = verts('Kitsune_body')
    o = bpy.data.objects['Kitsune_body']; vg = {g.index: g.name for g in o.vertex_groups}
    legs = np.array([any(vg[g.group].startswith(('thigh', 'shin')) and g.weight > .3 for g in v.groups) for v in o.data.vertices])
    sel = legs & (BV[:, 2] > .13) & (BV[:, 2] < .38)
    # a leg vertex pokes through when the hakama is not between it and the body axis: cast from the axis (same height) outward
    poke = 0; worst = 0.
    for p in BV[sel]:
        c = Vector((0, 0, float(p[2]))); d = Vector(p) - c; L = d.length
        if L < 1e-6: continue
        h = st.ray_cast(c, d.normalized(), L)
        if h[0] is not None:                              # the hakama lies between the axis and the leg: the leg is through it
            poke += 1; nn = st.find_nearest(Vector(p)); worst = max(worst, nn[3] or 0.)
    R[key] = {'leg_verts_checked': int(sel.sum()), 'outside_the_hakama': poke, 'worst_mm': round(worst * 1000, 1)}
json.dump(R, open(os.path.join(ROOT, 'scratch', 'rig_checks.json'), 'w'), indent=1)
print('RIG_CHECKS', json.dumps(R))
