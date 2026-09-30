# Standard asset preview for review (the codex-blender skill): renders an asset the same way every time so the
# director (Claude) can judge it from images, and writes its stats.
#
#   blender --background --factory-startup --python tools/blender/codex/preview.py -- --in ASSET.glb|.blend --out DIR
#           [--res 640] [--no-ref] [--character]
#
# Outputs in DIR:
#   sheet.png   2x2 contact sheet: game camera (yaw 45 deg, pitch ~42 deg, like the in-game view) | front | side | top
#   game.png    the game-camera view at 2x res, with a 1 m tall scale capsule (Chewy is ~1 m) and a 1 m ground grid
#   stats.json  triangles, vertices, objects, materials, textures (sizes), bounds (m, game axes: y up), origin check
# --character adds the views a character model sheet has (long lens, no grid or capsule):
#   turnaround.png  front | 3/4 | side | back, full body, same scale, side by side (compare with the concept sheet)
#   head.png        head close-up: front | 3/4 (the top ~40% of the figure)
# Conventions checked (see templates/brief.md): 1 unit = 1 m, the asset stands on the ground (min y ~ 0), centred on
# the origin in x/z, front faces the game's +z (Blender -Y; the glTF exporter converts).
import bpy, bmesh, sys, os, json, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
src = os.path.abspath(arg('--in'))
out = os.path.abspath(arg('--out', os.path.join(os.path.dirname(src), 'preview')))
res = int(arg('--res', '640'))
with_ref = '--no-ref' not in argv
character = '--character' in argv
os.makedirs(out, exist_ok=True)

# ---------------------------------------------------------------- load
if src.lower().endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=src)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
asset = [o for o in scene.objects if o.type == 'MESH' and o.visible_get()]
if not asset:
    raise SystemExit('preview: no visible mesh objects in ' + src)

# ---------------------------------------------------------------- stats (evaluated, triangulated)
dg = bpy.context.evaluated_depsgraph_get()
tris = verts = 0
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
mats, texs = set(), {}
for o in asset:
    ev = o.evaluated_get(dg); me = ev.to_mesh()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:])
    tris += len(bm.faces); verts += len(bm.verts); bm.free()
    for v in me.vertices:
        w = ev.matrix_world @ v.co
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    for s in o.material_slots:
        if s.material:
            mats.add(s.material.name)
            if s.material.use_nodes:
                for n in s.material.node_tree.nodes:
                    if n.type == 'TEX_IMAGE' and n.image:
                        texs[n.image.name] = list(n.image.size)
    ev.to_mesh_clear()
size = hi - lo
# Blender Z-up -> game Y-up: game (x, y, z) = (bx, bz, -by)
stats = {
    'file': src, 'objects': len(asset), 'triangles': tris, 'vertices': verts,
    'materials': sorted(mats), 'textures': texs,
    'size_m': {'x': round(size.x, 3), 'y': round(size.z, 3), 'z': round(size.y, 3)},
    'min_y': round(lo.z, 3), 'centre_xz': [round((lo.x + hi.x) / 2, 3), round(-(lo.y + hi.y) / 2, 3)],
}
warn = []
if abs(lo.z) > 0.05: warn.append(f'not standing on the ground: min y = {lo.z:.3f} m (expected ~0)')
if max(abs(stats['centre_xz'][0]), abs(stats['centre_xz'][1])) > 0.25 * max(size.x, size.y, 0.4): warn.append(f"not centred on the origin in x/z: {stats['centre_xz']}")
if max(size) > 60 or max(size) < 0.02: warn.append(f'suspicious scale: largest side {max(size):.3f} m (1 unit = 1 m)')
stats['warnings'] = warn

# ---------------------------------------------------------------- stage: ground, scale reference, lights, world
centre = (lo + hi) / 2; radius = max(size.length / 2, 0.5)
def add_mat(name, rgba, rough=0.8):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value = rgba; b.inputs['Roughness'].default_value = rough
    return m
bpy.ops.mesh.primitive_plane_add(size=max(6.0, radius * 6), location=(centre.x, centre.y, lo.z - 0.002))
ground = bpy.context.object; ground.data.materials.append(add_mat('pv_ground', (0.42, 0.5, 0.38, 1)))
grid = []
if with_ref:
    n = int(math.ceil(max(3.0, radius * 3)))
    for i in range(-n, n + 1):  # 1 m grid lines
        for axis in (0, 1):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(centre.x + (i if axis == 0 else 0), centre.y + (i if axis == 1 else 0), lo.z))
            c = bpy.context.object; c.scale = (0.012 if axis == 0 else n * 2, n * 2 if axis == 0 else 0.012, 0.002)
            c.data.materials.append(add_mat('pv_grid', (0.3, 0.36, 0.28, 1))); grid.append(c)
    # a 1 m tall capsule beside the asset: Chewy's height
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(hi.x + 0.6, centre.y, lo.z + 0.5))
    cap = bpy.context.object
    for dz in (0.28, -0.28):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(hi.x + 0.6, centre.y, lo.z + 0.5 + dz))
        s = bpy.context.object; s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
    cap.data.materials.append(add_mat('pv_ref', (0.55, 0.45, 0.85, 1)))
else:
    cap = None
sun = bpy.data.objects.new('pv_sun', bpy.data.lights.new('pv_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 2.4; sun.data.angle = math.radians(8); sun.rotation_euler = (math.radians(50), 0, math.radians(35))
fill = bpy.data.objects.new('pv_fill', bpy.data.lights.new('pv_fill', 'SUN')); scene.collection.objects.link(fill)
fill.data.energy = 0.5; fill.rotation_euler = (math.radians(60), 0, math.radians(215))
world = bpy.data.worlds.new('pv_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.78, 0.84, 0.95, 1); bg.inputs['Strength'].default_value = 0.55

# ---------------------------------------------------------------- render setup (EEVEE, filmic-ish, transparent-free)
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 24
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('pv_cam', bpy.data.cameras.new('pv_cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 50

def shoot(name, direction, r, lens=50, frame=1.25, target=None, rad=None):
    """camera looking along -direction at the target, framed to fit a sphere of radius rad (default: the asset's)"""
    t = target if target is not None else centre
    d = Vector(direction).normalized()
    cam.data.lens = lens
    fov = 2 * math.atan(18 / lens)  # 36 mm sensor width
    dist = (rad or radius) * frame / math.tan(fov / 2)
    cam.location = t + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x = scene.render.resolution_y = r
    scene.render.filepath = os.path.join(out, name + '.png')
    bpy.ops.render.render(write_still=True)
    return scene.render.filepath

# game camera: from the game's +x/+z (Blender +x, -y), 42 deg down; a long lens like the game's distant camera
pitch = math.radians(42)
game_dir = (math.cos(pitch) * math.sqrt(0.5), -math.cos(pitch) * math.sqrt(0.5), math.sin(pitch))
views = [('v_game', game_dir, 85), ('v_front', (0, -1, 0.12), 50), ('v_side', (1, 0, 0.12), 50), ('v_top', (0.001, -0.001, 1), 50)]
# (the scale capsule only stands in the game views: in front / side / top it would hide the asset)
def ref(on):
    if cap: cap.hide_render = not on
ref(True); paths = [shoot(*views[0][:2], res, lens=views[0][2])]
ref(False); paths += [shoot(n, d, res, lens=l) for n, d, l in views[1:]]
ref(True); shoot('game', game_dir, res * 2, lens=85, frame=1.6)

# ---------------------------------------------------------------- contact sheets
import numpy as np
def montage(paths, cols, name):
    """same-size renders in a grid (row-major, top row first) -> name.png; the parts are deleted"""
    ims = [bpy.data.images.load(p) for p in paths]
    w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols
    canvas = np.ones((rows * h, cols * w, 4), np.float32)
    for k, im in enumerate(ims):
        a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); a = a.reshape(h, w, 4)
        r, c = k // cols, k % cols
        y0 = (rows - 1 - r) * h  # (image rows start at the bottom)
        canvas[y0:y0 + h, c * w:(c + 1) * w] = a
    img = bpy.data.images.new('pv_' + name, cols * w, rows * h)
    img.pixels.foreach_set(canvas.ravel())
    img.filepath_raw = os.path.join(out, name + '.png'); img.file_format = 'PNG'; img.save()
    for p in paths: os.remove(p)
montage(paths, 2, 'sheet')

if character:
    ref(False)
    for g in grid: g.hide_render = True
    lo_t = (0, -1, 0.06); tq = (0.64, -0.77, 0.06); sd = (1, 0, 0.06); bk = (0, 1, 0.06)
    montage([shoot('t_' + n, d, res, lens=100, frame=1.08) for n, d in (('front', lo_t), ('34', tq), ('side', sd), ('back', bk))], 4, 'turnaround')
    H = hi.z - lo.z
    ht = Vector((centre.x, centre.y, lo.z + H * 0.8)); hr = H * 0.24
    montage([shoot('h_' + n, d, res, lens=100, frame=1.15, target=ht, rad=hr) for n, d in (('front', lo_t), ('34', tq))], 2, 'head')

with open(os.path.join(out, 'stats.json'), 'w', encoding='utf-8') as f:
    json.dump(stats, f, indent=2)
print('PREVIEW', json.dumps(stats))
