# Review renders for the Blossom Hollow craft buildings (from landmarks-hollow's) (beyond the standard preview.py):
# --keep kit_hot[,kit_x]: kit layers the game keeps (catalog glbKeep) stay visible beside ours, glowing like the game.
#   blender --background --factory-startup --python render_views.py -- --in <glb|obj> --out <dir> --tag L2
#           [--ref <ref png> --refyaw 135] [--kit <kit obj>]
# Writes <dir>/<tag>-gamecam.png: the game camera (vertical FOV 20 deg, 45 deg down) at 22 m and 12 m, yaw -45 | +45,
# a 1 m capsule by the door. With --ref: <dir>/<tag>-kitcmp.png = the in-game kit screenshot | ours at the same yaw
# (| the kit dump rendered here, with --kit).
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
SRC = os.path.abspath(arg('--in')); OUT = os.path.abspath(arg('--out')); TAG = arg('--tag', 'L2')
REF = arg('--ref'); REFYAW = float(arg('--refyaw', '135')); KIT = arg('--kit')
W, H = int(arg('--w', '960')), int(arg('--h', '540'))
ONLY = arg('--only', 'all')
os.makedirs(OUT, exist_ok=True)
print('RV pid', os.getpid())

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
        mt = bpy.data.materials.new('kit_vc'); mt.use_nodes = True; nt = mt.node_tree
        b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
        vc = nt.nodes.new('ShaderNodeVertexColor')
        nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
        for o in obs:
            if o.data.color_attributes: vc.layer_name = o.data.color_attributes[0].name
            o.data.materials.clear(); o.data.materials.append(mt)
            for p in o.data.polygons: p.use_smooth = True
    else:
        bpy.ops.import_scene.gltf(filepath=path)
        obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    return obs

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
asset = load_asset(SRC)
kit = load_asset(KIT) if KIT else []
# daylight: the game drives window_glow's intensity by time of day (the kit's day level is ~0.06 of night); render days
for m in bpy.data.materials:
    if 'glow' in m.name and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs['Emission Strength'].default_value = float(arg('--glow', '0.06'))
KEEP = [k for k in (arg('--keep', '') or '').split(',') if k]
keepobs = [o for o in kit if any(o.name.startswith(k) for k in KEEP)]
for o in keepobs:   # (the game's 'hot' layer: always glowing, vertex-coloured)
    mt = bpy.data.materials.new('keep_hot'); mt.use_nodes = True; nt = mt.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); vc = nt.nodes.new('ShaderNodeVertexColor')
    if o.data.color_attributes: vc.layer_name = o.data.color_attributes[0].name
    nt.links.new(vc.outputs['Color'], b.inputs['Base Color']); nt.links.new(vc.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = 1.5 if 'hot' in o.name else 0.0
    o.data.materials.clear(); o.data.materials.append(mt)
kit = [o for o in kit if o not in keepobs]
asset = asset + keepobs
for o in kit: o.hide_render = True

# stage: ground, capsule, sun + sky (soft, like the game's daylight)
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.004))
ground = bpy.context.object; ground.data.materials.append(flat_mat('rv_ground', '#86c060'))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth()
cap.data.materials.append(flat_mat('rv_cap', '#9a7ae0'))
DOOR = [float(v) for v in arg('--door', '0,1.4').split(',')]   # game (x, z) of the kit door
cap.location = Vector((DOOR[0] + 0.7, -DOOR[1] - 0.2, 0))       # beside the door spot
sun = bpy.data.objects.new('rv_sun', bpy.data.lights.new('rv_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 3.2; sun.data.angle = math.radians(10); sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
world = bpy.data.worlds.new('rv_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.78, 0.85, 0.98, 1); bg.inputs['Strength'].default_value = 0.75
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 24
except Exception: pass
try: scene.eevee.use_shadows = True
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rv_cam', bpy.data.cameras.new('rv_cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle_y = math.radians(20)

TGT = Vector((0.0, 0.0, float(arg('--ty', '1.5'))))
def shoot(path, yaw_deg, pitch_deg=45, dist=22, target=None, w=W, h=H):
    target = TGT if target is None else target
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = target + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.filepath = path; bpy.ops.render.render(write_still=True)
    return path

def load(p):
    im = bpy.data.images.load(p); w, h = im.size
    a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); bpy.data.images.remove(im)
    return a.reshape(h, w, 4)
def save(arr, p):
    h, w = arr.shape[:2]; img = bpy.data.images.new('rv_out', w, h)
    img.pixels.foreach_set(arr.astype(np.float32).ravel()); img.filepath_raw = p; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
def resize(a, h):
    sc = h / a.shape[0]
    yi = (np.arange(h) / sc).astype(int).clip(0, a.shape[0] - 1)
    xi = (np.arange(int(a.shape[1] * sc)) / sc).astype(int).clip(0, a.shape[1] - 1)
    return a[yi][:, xi]
def row(arrs, gap=6):
    h = max(a.shape[0] for a in arrs); parts = []
    for i, a in enumerate(arrs):
        if a.shape[0] != h: a = resize(a, h)
        if i: parts.append(np.ones((h, gap, 4), np.float32))
        parts.append(a)
    return np.hstack(parts)
def col(arrs, gap=6):
    w = max(a.shape[1] for a in arrs); parts = []
    for i, a in enumerate(arrs):
        if a.shape[1] < w: a = np.hstack([a, np.ones((a.shape[0], w - a.shape[1], 4), np.float32)])
        if i: parts.append(np.ones((gap, w, 4), np.float32))
        parts.append(a)
    return np.vstack(parts[::-1])   # (image rows start at the bottom)

tmp = os.path.join(OUT, '_rv_' + TAG + '_' + ONLY); os.makedirs(tmp, exist_ok=True)
if ONLY in ('all', 'gamecam'):
    rows = []
    for dist in (22, 12):
        rows.append(row([load(shoot(os.path.join(tmp, 'g%d_%d.png' % (dist, y)), y, 45, dist)) for y in (-45, 45)]))
    save(col(rows), os.path.join(OUT, TAG + '-gamecam.png'))
if (REF or KIT) and ONLY in ('all', 'kitcmp'):
    ref = load(os.path.abspath(REF)) if REF else None
    RD = float(arg('--refdist', '15.5'))
    ours = load(shoot(os.path.join(tmp, 'cmp.png'), REFYAW, 45, RD, w=1600, h=900))
    parts = [ref, ours] if REF else [ours]
    if kit:
        for o in asset: o.hide_render = o not in keepobs
        for o in kit: o.hide_render = False
        parts.append(load(shoot(os.path.join(tmp, 'cmpkit.png'), REFYAW, 45, RD, w=1600, h=900)))
        for o in asset: o.hide_render = False
        for o in kit: o.hide_render = True
    def crop(a, x0, y0, x1, y1):          # fractions, y from the top
        H_, W_ = a.shape[:2]
        return a[int(H_ * (1 - y1)):int(H_ * (1 - y0)), int(W_ * x0):int(W_ * x1)]
    REFBOX = [float(v) for v in arg('--refbox', '0.15,0.05,0.85,0.98').split(',')]
    OURBOX = [float(v) for v in arg('--ourbox', '0.15,0.05,0.85,0.98').split(',')]
    parts = ([crop(parts[0], *REFBOX)] if REF else []) + [crop(p, *OURBOX) for p in (parts[1:] if REF else parts)]
    save(row([resize(p, 620) for p in parts]), os.path.join(OUT, TAG + '-kitcmp.png'))
if ONLY in ('all', 'close'):
    shots = [load(shoot(os.path.join(tmp, 'c%d.png' % y), y, 40, 9, target=Vector((0, 0, 1.6)), w=900, h=900)) for y in (0, 135)]
    save(row(shots), os.path.join(OUT, TAG + '-close.png'))
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RV done', OUT)
