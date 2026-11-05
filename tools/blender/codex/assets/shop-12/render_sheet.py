# Review sheets for shop-12 (the 8 seeded variants of a shop level side by side at the game camera).
#   blender --background --factory-startup --python render_sheet.py -- --level 1 --mode ours|kit|cmp [--yaws -45,45]
#           [--pitch 35] [--only 0,3] [--tile 480x440] [--glow 0.06] [--tag name] [--dist 11]
# ours: preview/<level>-sheet.png   rows = yaws (first on top), columns = variants (public/models/shop-<level>-v<k>.glb)
# kit:  preview/<level>-kitsheet.png (the kit dumps, kitdump/kit-shop-<level>-v<k>.obj)
# cmp:  preview/<level>-kitcmp.png   ours (top row) over the kit's (bottom row), at the first yaw
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
L = int(arg('--level', '1')); MODE = arg('--mode', 'ours')
YAWS = [float(v) for v in arg('--yaws', '-45,45').split(',')]
PITCH = float(arg('--pitch', '35'))
ONLY = [int(v) for v in arg('--only', '0,1,2,3,4,5,6,7').split(',')]
TW, TH = [int(v) for v in arg('--tile', '480x440').split('x')]
TAG = arg('--tag', '')
OUT = os.path.join(HERE, 'preview'); os.makedirs(OUT, exist_ok=True)
print('RS pid', os.getpid())

def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin(h): h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def flat_mat(name, hexc, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough
    return m

def load_asset(path):
    before = set(bpy.data.objects)
    if path.lower().endswith('.obj'):
        bpy.ops.wm.obj_import(filepath=path)
        obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        mt = bpy.data.materials.get('kit_vc')
        if mt is None:
            mt = bpy.data.materials.new('kit_vc'); mt.use_nodes = True; nt = mt.node_tree
            b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
            vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Color'
            nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
        for o in obs:
            if o.data.color_attributes: o.data.color_attributes[0].name = 'Color'
            o.data.materials.clear(); o.data.materials.append(mt)
            for p in o.data.polygons: p.use_smooth = True
    else:
        bpy.ops.import_scene.gltf(filepath=path)
        for m in bpy.data.materials:
            if 'glow' in m.name and m.use_nodes:
                for n in m.node_tree.nodes:
                    if n.type == 'BSDF_PRINCIPLED': n.inputs['Emission Strength'].default_value = float(arg('--glow', '0.06'))
    return [o for o in bpy.data.objects if o not in before]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.004))
ground = bpy.context.object; ground.data.materials.append(flat_mat('rs_ground', '#86c060'))
fp = 2.0 if L == 1 else 3.0          # the footprint (tiles), a paler square
bpy.ops.mesh.primitive_plane_add(size=fp, location=(0, 0, -0.002))
foot = bpy.context.object; foot.data.materials.append(flat_mat('rs_foot', '#a8d488'))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth(); cap.data.materials.append(flat_mat('rs_cap', '#9a7ae0'))
DOOR = (0.0, 0.95) if L == 1 else (-0.2, 1.4)
cap.location = Vector((DOOR[0] + 0.75, -DOOR[1] - 0.15, 0))   # the 1 m capsule beside the kit's door spot
sun = bpy.data.objects.new('rs_sun', bpy.data.lights.new('rs_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3.2; sun.data.angle = math.radians(10); sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
world = bpy.data.worlds.new('rs_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.78, 0.85, 0.98, 1); bg.inputs['Strength'].default_value = 0.75
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 16
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rs_cam', bpy.data.cameras.new('rs_cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(20)
DIST = float(arg('--dist', '11' if L == 1 else '15'))
TGT = Vector((0.0, 0.1 if L == 1 else 0.3, 1.05 if L == 1 else 1.45))

tmp = os.path.join(OUT, '_rs_%d_%s%s' % (L, MODE, TAG)); os.makedirs(tmp, exist_ok=True)
def shoot(path, yaw_deg):
    yaw, pitch = math.radians(yaw_deg), math.radians(PITCH)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = TGT + d * DIST; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = TW, TH
    scene.render.filepath = path; bpy.ops.render.render(write_still=True)
    return path
def load(p):
    im = bpy.data.images.load(p); w, h = im.size
    a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im)
    return a.reshape(h, w, 4)
def save(arr, p):
    h, w = arr.shape[:2]; img = bpy.data.images.new('rs_out', w, h)
    img.pixels.foreach_set(arr.astype(np.float32).ravel()); img.filepath_raw = p; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
def row(arrs, gap=4):
    parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((a.shape[0], gap, 4), np.float32))
        parts.append(a)
    return np.hstack(parts)
def col(arrs, gap=4):
    parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((gap, a.shape[1], 4), np.float32))
        parts.append(a)
    return np.vstack(parts[::-1])     # (image rows start at the bottom: the first array ends on top)

def src(kind, k):
    if kind == 'kit': return os.path.join(HERE, 'kitdump', 'kit-shop-%d-v%d.obj' % (L, k))
    return os.path.join(REPO, 'public', 'models', 'shop-%d-v%d.glb' % (L, k))

def render_set(kind, yaws):
    grid = {y: [] for y in yaws}
    for k in ONLY:
        obs = load_asset(src(kind, k))
        for y in yaws: grid[y].append(load(shoot(os.path.join(tmp, '%s_%d_%d.png' % (kind, k, y)), y)))
        for o in obs: bpy.data.objects.remove(o, do_unlink=True)
    return [row(grid[y]) for y in yaws]

if MODE == 'ours':
    save(col(render_set('ours', YAWS)), os.path.join(OUT, '%d-sheet%s.png' % (L, TAG)))
elif MODE == 'kit':
    save(col(render_set('kit', YAWS)), os.path.join(OUT, '%d-kitsheet%s.png' % (L, TAG)))
else:
    a = render_set('ours', YAWS[:1])[0]; b = render_set('kit', YAWS[:1])[0]
    save(col([a, b]), os.path.join(OUT, '%d-kitcmp%s.png' % (L, TAG)))
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RS done')
