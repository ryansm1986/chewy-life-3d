# Review sheets for the home variants (task home-1).
#   blender --background --factory-startup --python render_sheet.py -- --level 1 --mode sheet|kitcmp|close [--variants 0,1,..]
#     [--out preview] [--pitch 35] [--dist 11]
# sheet:  preview/<level>-sheet.png   the variants side by side at the game camera (vertical FOV 20 deg, pitch 35 deg),
#         top row yaw -45, bottom row yaw +45, a 1 m capsule beside each door
# kitcmp: preview/<level>-kitcmp.png  per yaw: ours (top) over the kit dump (bottom), the same variants
# close:  preview/<level>-close-v<k>.png  one variant close up, yaw -45 | 0 | +45 | 180
import bpy, sys, os, math, json
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
L = int(arg('--level', '1')); MODE = arg('--mode', 'sheet')
VS = [int(x) for x in arg('--variants', '0,1,2,3,4,5,6,7').split(',')]
OUT = os.path.abspath(arg('--out', os.path.join(HERE, 'preview'))); os.makedirs(OUT, exist_ok=True)
PITCH = float(arg('--pitch', '35')); DIST = float(arg('--dist', '11'))
TW, TH = int(arg('--tw', '520')), int(arg('--th', '460'))
print('RS pid', os.getpid())
KJ = json.load(open(os.path.join(HERE, 'kitdump', 'kit-home-%d.json' % L), encoding='utf-8'))

def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin(h): h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def flat_mat(name, hexc, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough
    return m

def load(path):
    before = set(bpy.data.objects)
    if path.lower().endswith('.obj'):
        bpy.ops.wm.obj_import(filepath=path)
        obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        mt = bpy.data.materials.new('kit_vc'); mt.use_nodes = True; nt = mt.node_tree
        b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
        vc = nt.nodes.new('ShaderNodeVertexColor'); nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
        for o in obs:
            if o.data.color_attributes: vc.layer_name = o.data.color_attributes[0].name
            o.data.materials.clear(); o.data.materials.append(mt)
            for p in o.data.polygons: p.use_smooth = True
    else:
        bpy.ops.import_scene.gltf(filepath=path)
        obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    for o in obs: o.hide_render = True
    return obs

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
ours = {v: load(os.path.join(REPO, 'public', 'models', 'home-%d-v%d.glb' % (L, v))) for v in VS}
kits = {v: load(os.path.join(HERE, 'kitdump', 'kit-home-%d-v%d.obj' % (L, v))) for v in VS} if MODE == 'kitcmp' else {}
for m in bpy.data.materials:              # daylight: the game drives window_glow by the time of day (~0.06 by day)
    if 'glow' in m.name and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs['Emission Strength'].default_value = float(arg('--glow', '0.06'))

bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.004))
bpy.context.object.data.materials.append(flat_mat('rs_ground', '#86c060'))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth(); cap.data.materials.append(flat_mat('rs_cap', '#9a7ae0'))
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

def shoot(path, yaw_deg, pitch_deg, dist, target, w, h):
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = target + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.filepath = path; bpy.ops.render.render(write_still=True)
    return path
def img(p):
    im = bpy.data.images.load(p); w, h = im.size
    a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im)
    return a.reshape(h, w, 4)
def save(arr, p):
    h, w = arr.shape[:2]; im = bpy.data.images.new('rs_out', w, h)
    im.pixels.foreach_set(arr.astype(np.float32).ravel()); im.filepath_raw = p; im.file_format = 'PNG'; im.save(); bpy.data.images.remove(im)
def row(arrs, gap=4):
    h = arrs[0].shape[0]; parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((h, gap, 4), np.float32))
        parts.append(a)
    return np.hstack(parts)
def col(arrs, gap=4):
    w = arrs[0].shape[1]; parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((gap, w, 4), np.float32))
        parts.append(a)
    return np.vstack(parts[::-1])

def show(obs, on):
    for o in obs: o.hide_render = not on
def tile(v, objs, yaw, tmp, tag, dist=DIST, pitch=PITCH, w=TW, h=TH, target=None):
    show(objs, True)
    dr = KJ[str(v)]['door']; cap.location = Vector((dr[0] + 0.75, -dr[2] - 0.15, 0))
    t = shoot(os.path.join(tmp, '%s_%d_%d.png' % (tag, v, yaw)), yaw, pitch, dist, target or Vector((0, 0, 1.0)), w, h)
    show(objs, False)
    return img(t)

tmp = os.path.join(OUT, '_rs_%s_%d' % (MODE, os.getpid())); os.makedirs(tmp, exist_ok=True)
if MODE == 'sheet':
    rows = [row([tile(v, ours[v], yaw, tmp, 'o') for v in VS]) for yaw in (-45, 45)]
    save(col(rows, 8), os.path.join(OUT, '%d-sheet.png' % L))
elif MODE == 'kitcmp':
    rows = []
    for yaw in (-45, 45):
        rows.append(row([tile(v, ours[v], yaw, tmp, 'o') for v in VS]))
        rows.append(row([tile(v, kits[v], yaw, tmp, 'k') for v in VS]))
    save(col(rows, 8), os.path.join(OUT, '%d-kitcmp.png' % L))
elif MODE == 'close':
    for v in VS:
        shots = [tile(v, ours[v], yaw, tmp, 'c', dist=9.5, pitch=35, w=640, h=640, target=Vector((0, 0, 1.0))) for yaw in (-45, 0, 45, 180)]
        save(row(shots), os.path.join(OUT, '%d-close-v%d.png' % (L, v)))
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RS done', MODE)
