"""Round 4 check of the sculpted mouth in the exported GLB.
    blender --background --factory-startup --python verify_mouth.py
- the head skin is cut along the parting: open (boundary) edges along it, coincident vertex pairs, sealed corners;
- preview/jaw-test.png: rest | the lower lip dropped 9 mm (a crude jaw stand-in), front close-up, to show the parting opens.
"""
import bpy, bmesh, json, os, math
import numpy as np
from mathutils import Vector
T = os.path.dirname(os.path.abspath(__file__))
J = json.load(open(os.path.join(T, 'joints.json'), encoding='utf-8'))['mouth']
up = np.array(J['parting_upper_m']); corners = np.array(J['corners_m'])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='D:/projects/chewy-life-3d/public/models/shihtzu-toy.glb')
head = bpy.data.objects['Shihtzu_head']
M = head.matrix_world
bm = bmesh.new(); bm.from_mesh(head.data); bm.verts.ensure_lookup_table()
P = np.array([list(M @ v.co) for v in bm.verts])
tt = np.linspace(0, 1, 400); dense = np.array([np.interp(tt * (len(up) - 1), np.arange(len(up)), up[:, i]) for i in range(3)]).T
def near_part(p, tol):
    return np.min(np.linalg.norm(dense[None] - p[:, None], axis=2), axis=1) < tol
bnd = [e for e in bm.edges if e.is_boundary]
mid = np.array([list(M @ ((e.verts[0].co + e.verts[1].co) / 2)) for e in bnd]) if bnd else np.zeros((0, 3))
sel = [e for e, m_ in zip(bnd, near_part(mid, .003)) if m_]
ends = [(np.array(M @ e.verts[0].co), np.array(M @ e.verts[1].co)) for e in sel]
paired = 0
for i, (a0, a1) in enumerate(ends):
    for j, (b0, b1) in enumerate(ends):
        if i != j and ((np.linalg.norm(a0 - b0) < 2e-5 and np.linalg.norm(a1 - b1) < 2e-5) or (np.linalg.norm(a0 - b1) < 2e-5 and np.linalg.norm(a1 - b0) < 2e-5)):
            paired += 1; break
mouth_bnd = len(sel)
cand = np.where(near_part(P, .002))[0]
pairs = 0
for i in cand:
    d = np.linalg.norm(P[cand] - P[i], axis=1); pairs += int(((d < 2e-5) & (d > 0)).sum())
pairs //= 2
corner_copies = []
for c in corners:
    k = int(np.argmin(np.linalg.norm(P - c, axis=1))); corner_copies.append(int((np.linalg.norm(P - P[k], axis=1) < 5e-5).sum()))
out = {'mouth_boundary_edges': mouth_bnd, 'boundary_edges_with_a_coincident_partner': paired, 'unpaired (cracks)': mouth_bnd - paired, 'coincident_vertex_pairs_on_parting': pairs, 'parting_vertices': len(up),
       'vertices at each corner (1 = shared, sealed)': corner_copies}
print('VERIFY_MOUTH', json.dumps(out), flush=True)
json.dump(out, open(os.path.join(T, 'preview', 'mouth-check.json'), 'w'), indent=1)

# ---- render: rest and a dropped lower lip
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT'
try: sc.eevee.taa_render_samples = 32
except Exception: pass
sc.view_settings.view_transform = 'Standard'; sc.render.film_transparent = False
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.93, .90, .86, 1); sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35
for nm, loc, en in (('key', (-1.2, -2.2, 2.0), 140), ('fill', (1.6, -2.0, .6), 50)):
    d = bpy.data.lights.new(nm, 'AREA'); d.energy = en; d.size = 2.0; o = bpy.data.objects.new(nm, d); sc.collection.objects.link(o)
    o.location = loc; o.rotation_euler = (Vector((0, -.3, .82)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = .30
c = up.mean(0); cam.location = (c[0], c[1] - 2.0, c[2] + .02); cam.rotation_euler = (math.radians(90), 0, 0)
sc.render.resolution_x = 700; sc.render.resolution_y = 500
paths = []
def shot(name):
    p = os.path.join(T, 'scratch', name + '.png'); sc.render.filepath = p; bpy.ops.render.render(write_still=True); paths.append(p)
shot('_jaw_rest')
zp = lambda x: np.interp(x, up[:, 0], up[:, 2])
me = head.data; co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
Pw = np.array([list(M @ Vector(v)) for v in co])
xs = Pw[:, 0]; below = (Pw[:, 2] < zp(xs) - 1e-6) & (np.abs(xs) < .07) & (Pw[:, 1] < c[1] + .05) & (Pw[:, 2] > zp(xs) - .07)
w = np.clip(1 - (np.abs(xs) / .066) ** 2, 0, 1) ** 1.5 * np.clip(1 - (zp(xs) - Pw[:, 2]) / .07, 0, 1)
Pw[below, 2] -= .009 * w[below]
Minv = M.inverted()
co2 = np.array([list(Minv @ Vector(p)) for p in Pw]); me.vertices.foreach_set('co', co2.ravel()); me.update()
shot('_jaw_open')
ims = [bpy.data.images.load(p) for p in paths]; w_, h_ = 700, 500
canvas = np.ones((h_, 2 * w_ + 10, 4), np.float32)
for k, im in enumerate(ims):
    a = np.empty(w_ * h_ * 4, np.float32); im.pixels.foreach_get(a); canvas[:, k * (w_ + 10):k * (w_ + 10) + w_] = a.reshape(h_, w_, 4)
img = bpy.data.images.new('jaw', 2 * w_ + 10, h_); img.pixels.foreach_set(canvas.ravel())
img.filepath_raw = os.path.join(T, 'preview', 'jaw-test.png'); img.file_format = 'PNG'; img.save()
print('VERIFY_DONE', flush=True)
