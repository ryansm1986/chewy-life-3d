# shop-3 review sheets: every variant side by side at the game camera (pitch --pitch, yaws -45 | +45), and ours over the kit.
#   blender --background --factory-startup --python render_sheet.py -- --level 3 --variants 0,1,..7 --out preview
#           [--kitdir kitdump] [--only sheet|kitcmp|all] [--pitch 35] [--dist 17] [--tag 3]
# Writes <out>/<tag>-sheet.png (row 1 yaw -45, row 2 yaw +45; one column per variant) and <out>/<tag>-kitcmp.png
# (rows: ours -45, kit -45, ours +45, kit +45). Daylight; the window_glow material at its daytime level.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
LEVEL = arg('--level', '3'); VARS = [int(x) for x in arg('--variants', '0,1,2,3,4,5,6,7').split(',')]
OUT = os.path.abspath(arg('--out', os.path.join(HERE, 'preview'))); KITDIR = arg('--kitdir', os.path.join(HERE, 'kitdump'))
ONLY = arg('--only', 'all'); PITCH = float(arg('--pitch', '35')); DIST = float(arg('--dist', '17')); TAG = arg('--tag', LEVEL)
TW, TH = int(arg('--tw', '440')), int(arg('--th', '520'))
GLOW_DAY = float(arg('--glow', '0.06'))
os.makedirs(OUT, exist_ok=True)
print('SHEET pid', os.getpid())

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
        for o in obs:
            mt = bpy.data.materials.new('kit_vc'); mt.use_nodes = True; nt = mt.node_tree
            b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
            vc = nt.nodes.new('ShaderNodeVertexColor')
            if o.data.color_attributes: vc.layer_name = o.data.color_attributes[0].name
            nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
            o.data.materials.clear(); o.data.materials.append(mt)
            for p in o.data.polygons: p.use_smooth = True
    else:
        bpy.ops.import_scene.gltf(filepath=path)
        obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    return obs

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
ours, kits = {}, {}
for v in VARS:
    ours[v] = load(os.path.join(REPO, 'public', 'models', 'shop-%s-v%d.glb' % (LEVEL, v)))
    kp = os.path.join(KITDIR, 'kit-shop-%s-v%d.obj' % (LEVEL, v))
    kits[v] = load(kp) if ONLY in ('all', 'kitcmp') and os.path.exists(kp) else []
for m in bpy.data.materials:
    if 'glow' in m.name and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs['Emission Strength'].default_value = GLOW_DAY
allobs = [o for v in VARS for o in ours[v] + kits[v]]
def show(obs):
    for o in allobs: o.hide_render = o not in obs

bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.004))
bpy.context.object.data.materials.append(flat_mat('rv_ground', '#86c060'))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth(); cap.data.materials.append(flat_mat('rv_cap', '#9a7ae0'))
cap.location = Vector((0.75, -1.75, 0))          # beside the door spot (game x 0.75, z 1.75)
sun = bpy.data.objects.new('rv_sun', bpy.data.lights.new('rv_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3.2; sun.data.angle = math.radians(10); sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
world = bpy.data.worlds.new('rv_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.78, 0.85, 0.98, 1); bg.inputs['Strength'].default_value = 0.75
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 16
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rv_cam', bpy.data.cameras.new('rv_cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(20)
TGT = Vector((0.0, 0.0, float(arg('--ty', '1.9'))))
tmp = os.path.join(OUT, '_sheet_' + TAG); os.makedirs(tmp, exist_ok=True)
def shoot(name, yaw_deg):
    yaw, pitch = math.radians(yaw_deg), math.radians(PITCH)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = TGT + d * DIST; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = TW, TH
    p = os.path.join(tmp, name + '.png'); scene.render.filepath = p; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(p); w, h = im.size
    a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im); os.remove(p)
    return a.reshape(h, w, 4)
def save(arr, p):
    h, w = arr.shape[:2]; img = bpy.data.images.new('rv_out', w, h)
    img.pixels.foreach_set(arr.astype(np.float32).ravel()); img.filepath_raw = p; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
def row(arrs, gap=4):
    out = []
    for i, a in enumerate(arrs):
        if i: out.append(np.ones((a.shape[0], gap, 4), np.float32))
        out.append(a)
    return np.hstack(out)
def col(arrs, gap=4):
    out = []
    for i, a in enumerate(arrs):
        if i: out.append(np.ones((gap, a.shape[1], 4), np.float32))
        out.append(a)
    return np.vstack(out[::-1])      # (image rows start at the bottom)

if ONLY in ('all', 'sheet'):
    rows = []
    for yaw in (-45, 45):
        tiles = []
        for v in VARS:
            show(ours[v]); tiles.append(shoot('o%d_%d' % (v, yaw), yaw))
        rows.append(row(tiles))
    save(col(rows), os.path.join(OUT, TAG + '-sheet.png'))
if ONLY in ('all', 'kitcmp'):
    rows = []
    for yaw in (-45, 45):
        a, b = [], []
        for v in VARS:
            show(ours[v]); a.append(shoot('o%d_%d' % (v, yaw), yaw))
            show(kits[v]); b.append(shoot('k%d_%d' % (v, yaw), yaw))
        rows += [row(a), row(b)]
    save(col(rows), os.path.join(OUT, TAG + '-kitcmp.png'))
os.rmdir(tmp)
print('SHEET done', OUT)
