# Review renders for a village piece (beyond the standard preview.py):
#   blender --background --factory-startup --python render_views.py -- --in <glb> --out <dir> --piece <name>
#           [--kit <kit crop png> --kitbox x0,y0,x1,y1]   (pixel box of the kit piece in the kit screenshot)
# Writes <dir>/<piece>-gamecam.png (45 deg down from ~8 m at yaw -45 | 0 | +45, beside a 1 m capsule),
# <dir>/<piece>-zones.png (yaw 0 in the four zone tints, waystone only), <dir>/<piece>-kitcmp.png (the kit crop | ours).
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
SRC = os.path.abspath(arg('--in')); OUT = os.path.abspath(arg('--out')); PIECE = arg('--piece', 'piece')
KIT = arg('--kit'); KITBOX = arg('--kitbox')
DIST = float(arg('--dist', '8')); RES = int(arg('--res', '720'))
os.makedirs(OUT, exist_ok=True)
print('RV pid', os.getpid())

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
asset = [o for o in scene.objects if o.type == 'MESH']
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in asset:
    for v in o.data.vertices:
        w = o.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
centre = (lo + hi) / 2

def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin(h): h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)

def flat_mat(name, hexc, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough
    return m

# the tint materials: rebuild as Col x colour so the zone tint can be swapped
tints = {}
for m in bpy.data.materials:
    if m.name.startswith('tint'):
        nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        b.inputs['Roughness'].default_value = 0.8
        vc = nt.nodes.new('ShaderNodeVertexColor')
        names = [a.name for o in asset for a in o.data.color_attributes]
        vc.layer_name = names[0] if names else 'Col'
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1
        nt.links.new(vc.outputs['Color'], mx.inputs[6]); nt.links.new(mx.outputs[2], b.inputs['Base Color'])
        nt.links.new(b.outputs[0], out.inputs[0])
        tints[m.name] = mx.inputs[7]
ZONES = [('bamboo', '#5a9a88', '#86a856', '#7cbc5a'), ('maple', '#c8402e', '#d8582e', '#c89a5a'),
         ('tidepool', '#3a8ab8', '#e8f0ec', '#e8d8a8'), ('onsen', '#6a7ac8', '#f4f8ff', '#e8eef8')]
def set_zone(z):
    if 'tintRoof' in tints: tints['tintRoof'].default_value = lin(z[1])
    if 'tintCap' in tints: tints['tintCap'].default_value = lin(z[2])
    ground_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = lin(z[3])

# stage: ground, capsule, sun + sky
bpy.ops.mesh.primitive_plane_add(size=40, location=(centre.x, centre.y, lo.z - 0.003))
ground = bpy.context.object; ground_mat = flat_mat('rv_ground', '#7cbc5a'); ground.data.materials.append(ground_mat)
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth()
cap.data.materials.append(flat_mat('rv_cap', '#9a7ae0'))
cap.location = Vector((float(arg('--capx', '0')), float(arg('--capy', str(lo.y - 0.6))), 0))
sun = bpy.data.objects.new('rv_sun', bpy.data.lights.new('rv_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 2.4; sun.data.angle = math.radians(12); sun.rotation_euler = (math.radians(42), 0, math.radians(-30))
world = bpy.data.worlds.new('rv_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.75, 0.82, 0.95, 1); bg.inputs['Strength'].default_value = 0.6
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 32
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rv_cam', bpy.data.cameras.new('rv_cam')); scene.collection.objects.link(cam); scene.camera = cam

def shoot(path, yaw_deg, pitch_deg=45, dist=DIST, lens=50, target=None, w=RES, h=RES):
    t = target if target is not None else Vector((centre.x, centre.y, (lo.z + hi.z) * 0.42))
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    # yaw 0 = looking from the front (Blender -Y, the game's +z), positive yaw swings round toward +X
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = t + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
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
def row(arrs, gap=6):
    h = max(a.shape[0] for a in arrs)
    out = [np.vstack([np.ones((h - a.shape[0], a.shape[1], 4), np.float32), a]) if a.shape[0] < h else a for a in arrs]
    parts = []
    for i, a in enumerate(out):
        if i: parts.append(np.ones((h, gap, 4), np.float32))
        parts.append(a)
    return np.hstack(parts)

tmp = os.path.join(OUT, '_rv'); os.makedirs(tmp, exist_ok=True)
set_zone(ZONES[0])
shots = [shoot(os.path.join(tmp, 'g%d.png' % i), y) for i, y in enumerate((-45, 0, 45))]
save(row([load(p) for p in shots]), os.path.join(OUT, PIECE + '-gamecam.png'))
# a closer front view (for the kit comparison and the plaque)
close = shoot(os.path.join(tmp, 'close.png'), 0, 45, dist=DIST * 0.62)
if tints:
    cap.hide_render = True
    zs = []
    for i, z in enumerate(ZONES):
        set_zone(z); zs.append(shoot(os.path.join(tmp, 'z%d.png' % i), 20, 45, dist=DIST * 0.7, w=RES, h=RES))
    save(row([load(p) for p in zs]), os.path.join(OUT, PIECE + '-zones.png'))
    set_zone(ZONES[0]); cap.hide_render = False
if KIT and KITBOX:
    x0, y0, x1, y1 = [int(v) for v in KITBOX.split(',')]
    k = load(KIT); H = k.shape[0]
    crop = k[H - y1:H - y0, x0:x1]           # (image rows start at the bottom)
    ours = load(close)
    # scale the crop to our height by nearest-neighbour
    sc = ours.shape[0] / crop.shape[0]
    yi = (np.arange(ours.shape[0]) / sc).astype(int).clip(0, crop.shape[0] - 1)
    xi = (np.arange(int(crop.shape[1] * sc)) / sc).astype(int).clip(0, crop.shape[1] - 1)
    save(row([crop[yi][:, xi], ours]), os.path.join(OUT, PIECE + '-kitcmp.png'))
# the plaque close-up: before the village is saved (rune hidden) | after (rune shown)
rune = [o for o in asset if o.name.startswith('rune')]
if rune:
    cap.hide_render = True
    rc = Vector((0, 0, 0)); nv = 0
    for o in rune:
        for v in o.data.vertices: rc += o.matrix_world @ v.co; nv += 1
    rc /= max(1, nv)
    for o in rune: o.hide_render = True
    a = shoot(os.path.join(tmp, 'p0.png'), 0, 22, dist=0.85, target=rc, w=560, h=560)
    for o in rune: o.hide_render = False
    b = shoot(os.path.join(tmp, 'p1.png'), 0, 22, dist=0.85, target=rc, w=560, h=560)
    for o in rune: o.hide_render = True
    c = shoot(os.path.join(tmp, 'p2.png'), 0, 45, dist=DIST * 0.62)
    for o in rune: o.hide_render = False
    save(row([load(a), load(b)]), os.path.join(OUT, PIECE + '-plaque.png'))
    os.replace(c, os.path.join(OUT, PIECE + '-close-unsaved.png'))
    cap.hide_render = False
# the rocker through its range: side views (from the game's +z, Blender -Y) at -0.62, 0 and +0.35 rad
rk = bpy.data.objects.get('rocker')
if rk:
    cap.hide_render = True
    r0 = rk.rotation_euler.copy(); shots = []
    for i, a in enumerate((-0.62, 0.0, 0.35)):
        rk.rotation_mode = 'XYZ'; rk.rotation_euler = (r0[0], r0[1] - a, r0[2])   # (game rotation.z = a -> Blender Y by -a)
        shots.append(shoot(os.path.join(tmp, 'rk%d.png' % i), 0, 8, dist=3.2, target=Vector((-0.4, 0, 0.45)), w=640, h=440))
    rk.rotation_euler = r0
    save(row([load(p) for p in shots]), os.path.join(OUT, PIECE + '-rocker.png'))
    cap.hide_render = False
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RV done', OUT)
