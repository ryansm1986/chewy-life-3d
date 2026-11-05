# Review renders for the level-2 homes (task home-2): the 8 variants side by side at the game camera.
#   blender --background --factory-startup --python render_sheet.py -- --mode sheet|kitcmp|close [--level 2] [--only 0,3]
# sheet:  preview/<level>-sheet.png   our 8 GLBs, row 1 yaw -45, row 2 yaw +45 (pitch 35 deg, vertical FOV 20 deg)
# kitcmp: preview/<level>-kitcmp.png  per variant: ours over the kit dump (kitdump/kit-home-<level>-v<k>.obj), both yaws
# close:  preview/<level>-v<k>-close.png  one variant up close, four views (front-left, front-right, back-left, top)
# A 1 m capsule (Chewy's height) stands beside each kit door. Daylight: window_glow at the game's day level.
import bpy, sys, os, math, json
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODE = arg('--mode', 'sheet'); LEVEL = int(arg('--level', '2'))
ONLY = [int(k) for k in arg('--only', '0,1,2,3,4,5,6,7').split(',')]
TW, TH = int(arg('--tw', '520')), int(arg('--th', '470'))
PITCH = float(arg('--pitch', '35')); DIST = float(arg('--dist', '15'))
OUT = os.path.join(HERE, 'preview'); os.makedirs(OUT, exist_ok=True)
INFO = json.load(open(os.path.join(HERE, 'kitdump', 'kit-info.json')))
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
        for o in obs:
            mt = bpy.data.materials.new('kit_vc'); mt.use_nodes = True; nt = mt.node_tree
            b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
            vc = nt.nodes.new('ShaderNodeVertexColor')
            if o.data.color_attributes: vc.layer_name = o.data.color_attributes[0].name
            nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
            if 'glow' in o.name:
                nt.links.new(vc.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 0.06
            o.data.materials.clear(); o.data.materials.append(mt)
            for p in o.data.polygons: p.use_smooth = True
    else:
        bpy.ops.import_scene.gltf(filepath=path)
        obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    return obs

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
ours, kits = {}, {}
for k in ONLY:
    if MODE in ('sheet', 'kitcmp', 'close'):
        p = os.path.join(REPO, 'public', 'models', 'home-%d-v%d.glb' % (LEVEL, k))
        if os.path.exists(p): ours[k] = load_asset(p)
    if MODE in ('kitcmp', 'kitonly'):
        kits[k] = load_asset(os.path.join(HERE, 'kitdump', 'kit-home-%d-v%d.obj' % (LEVEL, k)))
for m in bpy.data.materials:
    if 'glow' in m.name and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs['Emission Strength'].default_value = float(arg('--glow', '0.06'))

bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.004))
ground = bpy.context.object; ground.data.materials.append(flat_mat('rs_ground', '#86c060'))
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
try: scene.eevee.taa_render_samples = 24
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rs_cam', bpy.data.cameras.new('rs_cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(20)

def show(k, which):
    for kk, obs in ours.items():
        for o in obs: o.hide_render = not (kk == k and which == 'ours')
    for kk, obs in kits.items():
        for o in obs: o.hide_render = not (kk == k and which == 'kit')
    d = INFO['home-%d-v%d' % (LEVEL, k)]['door']
    cap.location = Vector((d[0] + (0.75 if d[0] < 0 else -0.75), -(d[2] + 0.1), 0))

def shoot(path, yaw_deg, pitch_deg=PITCH, dist=DIST, target=Vector((0, 0, 1.25)), w=TW, h=TH):
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    dd = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = target + dd * dist; cam.rotation_euler = (-dd).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = w, h
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
    return np.vstack(parts[::-1])   # (image rows start at the bottom)

tmp = os.path.join(OUT, '_rs_%s' % MODE); os.makedirs(tmp, exist_ok=True)
if MODE == 'sheet':
    rows = []
    for yaw in (-45, 45):
        tiles = []
        for k in ONLY:
            show(k, 'ours'); tiles.append(load(shoot(os.path.join(tmp, 's%d_%d.png' % (k, yaw)), yaw)))
        rows.append(row(tiles))
    save(col(rows), os.path.join(OUT, '%d-sheet.png' % LEVEL))
elif MODE in ('kitcmp', 'kitonly'):
    rows = []
    for yaw in (-45, 45):
        for which in (('ours', 'kit') if MODE == 'kitcmp' else ('kit',)):
            tiles = []
            for k in ONLY:
                show(k, which); tiles.append(load(shoot(os.path.join(tmp, 'c%d_%d_%s.png' % (k, yaw, which)), yaw)))
            rows.append(row(tiles))
    save(col(rows), os.path.join(OUT, '%d-%s%s.png' % (LEVEL, MODE, arg('--suffix', ''))))
elif MODE == 'close':
    for k in ONLY:
        show(k, 'ours')
        a = [load(shoot(os.path.join(tmp, 'x%d_%d.png' % (k, i)), yw, pt, ds, target=Vector((0, 0, 1.2)), w=760, h=640))
             for i, (yw, pt, ds) in enumerate(((-40, 35, 10), (40, 35, 10), (150, 35, 10), (0, 70, 12)))]
        save(col([row(a[2:]), row(a[:2])]), os.path.join(OUT, '%d-v%d-close.png' % (LEVEL, k)))
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RS done')
