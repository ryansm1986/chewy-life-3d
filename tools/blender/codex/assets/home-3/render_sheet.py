# Review sheets for the home variants (home-3 task):
#   blender --background --factory-startup --python render_sheet.py -- --mode sheet|kitcmp|close --level 3 [--only 0,1] [--tag x]
# sheet : preview/<level>-sheet.png   the 8 variant GLBs at the game camera (pitch 35 deg, ~13 m), yaw -45 (top row) | +45
# kitcmp: preview/<level>-kitcmp.png  ours (upper row) over the kit dump (lower row) at the same camera, yaw +45 then -45
# close : preview/<level>-close-v<k>.png   one variant close up: game cam 9 m both yaws + a front view, with a 1 m capsule
# Each model is rendered alone at the origin (same camera for all), the frames tiled with numpy.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MODE = arg('--mode', 'sheet'); LV = int(arg('--level', '3')); TAG = arg('--tag', '')
ONLY = [int(v) for v in arg('--only', '0,1,2,3,4,5,6,7').split(',')]
PITCH = float(arg('--pitch', '35')); DIST = float(arg('--dist', '13')); TY = float(arg('--ty', '1.7'))
OUT = os.path.join(HERE, 'preview'); os.makedirs(OUT, exist_ok=True)
print('RS pid', os.getpid())

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
        mt = bpy.data.materials.get('kit_vc')
        if mt is None:
            mt = bpy.data.materials.new('kit_vc'); mt.use_nodes = True; nt = mt.node_tree
            b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
            vc = nt.nodes.new('ShaderNodeVertexColor'); nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
        for o in obs:
            o.data.materials.clear(); o.data.materials.append(mt)
            for p in o.data.polygons: p.use_smooth = True
    else:
        bpy.ops.import_scene.gltf(filepath=path)
        obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    for o in obs: o.hide_render = True
    return obs

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
ours = {k: load(os.path.join(REPO, 'public', 'models', 'home-%d-v%d.glb' % (LV, k))) for k in ONLY if MODE != 'kitonly'}
kits = {k: load(os.path.join(HERE, 'kitdump', 'kit-home-%d-v%d.obj' % (LV, k))) for k in ONLY if MODE in ('kitcmp', 'kitonly')}
for m in bpy.data.materials:
    if 'glow' in m.name and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs['Emission Strength'].default_value = float(arg('--glow', '0.06'))

bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -0.004))
bpy.context.object.data.materials.append(flat_mat('rs_ground', '#86c060'))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth(); cap.data.materials.append(flat_mat('rs_cap', '#9a7ae0'))
cap.hide_render = MODE != 'close'
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

tmp = os.path.join(OUT, '_rs_%s_%s' % (MODE, TAG or 'x')); os.makedirs(tmp, exist_ok=True)
def shoot(name, yaw_deg, pitch_deg, dist, w, h, ty=TY):
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    tgt = Vector((0, 0, ty))
    cam.location = tgt + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = w, h
    p = os.path.join(tmp, name + '.png'); scene.render.filepath = p; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(p); W_, H_ = im.size
    a = np.empty(W_ * H_ * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im); os.remove(p)
    return a.reshape(H_, W_, 4)
def show(obs, on):
    for o in obs: o.hide_render = not on
def save(arr, p):
    h, w = arr.shape[:2]; img = bpy.data.images.new('rs_out', w, h)
    img.pixels.foreach_set(arr.astype(np.float32).ravel()); img.filepath_raw = p; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
def row(arrs, gap=4): return np.hstack(sum([[a] + ([np.ones((a.shape[0], gap, 4), np.float32)] if i < len(arrs) - 1 else []) for i, a in enumerate(arrs)], []))
def col(arrs, gap=4):
    parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((gap, a.shape[1], 4), np.float32))
        parts.append(a)
    return np.vstack(parts[::-1])                 # (pixel rows start at the bottom)

W, H = int(arg('--w', '440')), int(arg('--h', '520'))
if MODE == 'sheet':
    rows = []
    for yaw in (45, -45):
        fr = []
        for k in ONLY:
            show(ours[k], True); fr.append(shoot('s%d_%d' % (k, yaw), yaw, PITCH, DIST, W, H)); show(ours[k], False)
        rows.append(row(fr))
    save(col(rows), os.path.join(OUT, '%d-sheet%s.png' % (LV, TAG)))
elif MODE in ('kitcmp', 'kitonly'):
    rows = []
    for yaw in (45, -45):                       # (col() stacks bottom-up: ours ends up over the kit, -45 on top)
        for src in ((kits, ours) if MODE == 'kitcmp' else (kits,)):
            fr = []
            for k in ONLY:
                show(src[k], True); fr.append(shoot('k%d_%d' % (k, yaw), yaw, PITCH, DIST, W, H)); show(src[k], False)
            rows.append(row(fr))
    save(col(rows), os.path.join(OUT, '%d-%s%s.png' % (LV, MODE, TAG)))
elif MODE == 'close':
    for k in ONLY:
        show(ours[k], True)
        cap.location = Vector((0.45 * (1 if k % 2 else -1) + 0.75, -1.7, 0))
        fr = [shoot('c%d_a' % k, -45, 40, 15, 800, 800, ty=1.9), shoot('c%d_b' % k, 45, 40, 15, 800, 800, ty=1.9), shoot('c%d_f' % k, 0, 12, 15, 800, 800, ty=2.0)]
        save(row(fr), os.path.join(OUT, '%d-close-v%d%s.png' % (LV, k, TAG)))
        show(ours[k], False)
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RS done')
