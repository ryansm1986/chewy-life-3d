# Review renders for the hollow-ext pieces (beyond the standard preview.py):
#   blender --background --factory-startup --python render_views.py -- --piece <name> [--in <glb>] [--kit <obj>] --out <dir>
#           [--dist 6] [--res 520] [--ty 0.9]
# Writes <dir>/<piece>-gamecam.png (rows: 35 and 45 deg down; columns: yaw -45 | 0 | +45; a 1 m capsule beside it),
# <dir>/<piece>-close.png (front, 45 deg, closer) and, with --kit, <dir>/<piece>-kitcmp.png (top row the kit OBJ dump,
# bottom row ours, same cameras: yaw -35 | 0 | +35 at 40 deg). With --kit and no --in: <dir>/<piece>-kitonly.png.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
SRC = arg('--in'); KIT = arg('--kit'); OUT = os.path.abspath(arg('--out')); PIECE = arg('--piece', 'piece')
DIST = float(arg('--dist', '6')); RES = int(arg('--res', '520')); TY = float(arg('--ty', '0.9'))
os.makedirs(OUT, exist_ok=True)
print('RV pid', os.getpid())

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin(h): h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def flat_mat(name, hexc, rough=0.9, emit=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough
    if emit: b.inputs['Emission Color'].default_value = lin(hexc); b.inputs['Emission Strength'].default_value = emit
    return m

def vc_mat(name, layer, glow=False):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = layer
    nt.links.new(vc.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.85
    if glow:
        nt.links.new(vc.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 0.35
    return m

ours, kit = [], []
if SRC:
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(SRC))
    ours = [o for o in scene.objects if o not in before and o.type == 'MESH']
    for o in ours:          # (glow: a little emission so lanterns read lit, like dusk in the game)
        for i, m in enumerate(o.data.materials):
            if m and 'glow' in m.name:
                nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
                vc = next((n for n in nt.nodes if n.type == 'VERTEX_COLOR'), None)
                if vc: nt.links.new(vc.outputs['Color'], b.inputs['Emission Color'])
                b.inputs['Emission Strength'].default_value = 0.35
if KIT:
    before = set(scene.objects)
    bpy.ops.wm.obj_import(filepath=os.path.abspath(KIT))
    kit = [o for o in scene.objects if o not in before and o.type == 'MESH']
    for o in kit:
        layer = o.data.color_attributes[0].name if o.data.color_attributes else 'Color'
        o.data.materials.clear(); o.data.materials.append(vc_mat('kit_' + o.name, layer, glow='glow' in o.name))
        o.data.shade_smooth() if hasattr(o.data, 'shade_smooth') else None
        o.location.x = 0.0  # (side-by-side handled by hiding)

def bounds(objs):
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi
lo, hi = bounds(ours or kit)
print('RV bounds', [round(v, 3) for v in lo], [round(v, 3) for v in hi])

bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.002))
ground = bpy.context.object; ground.data.materials.append(flat_mat('rv_ground', '#86bf62'))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth()
cap.data.materials.append(flat_mat('rv_cap', '#9a7ae0'))
cap.location = Vector((hi.x + 0.45, lo.y - 0.35, 0))
sun = bpy.data.objects.new('rv_sun', bpy.data.lights.new('rv_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 2.6; sun.data.angle = math.radians(14); sun.rotation_euler = (math.radians(45), 0, math.radians(-28))
world = bpy.data.worlds.new('rv_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.78, 0.84, 0.95, 1); bg.inputs['Strength'].default_value = 0.75
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 24
except Exception: pass
try: scene.eevee.use_shadows = True
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rv_cam', bpy.data.cameras.new('rv_cam')); scene.collection.objects.link(cam); scene.camera = cam

def shoot(path, yaw_deg, pitch_deg=45, dist=DIST, lens=50, target=None, w=RES, h=RES):
    t = target if target is not None else Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, TY))
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
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
    parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((a.shape[0], gap, 4), np.float32))
        parts.append(a)
    return np.hstack(parts)
def col(rows, gap=6):
    parts = []
    for i, a in enumerate(rows):
        if i: parts.insert(0, np.ones((gap, a.shape[1], 4), np.float32))
        parts.insert(0, a)        # (image rows go bottom-up: the first row ends on top)
    return np.vstack(parts)

tmp = os.path.join(OUT, '_rv_' + PIECE); os.makedirs(tmp, exist_ok=True)
def show(objs):
    for o in ours + kit: o.hide_render = o not in objs
if ours:
    show(ours)
    rows = []
    for pitch in (35, 45):
        rows.append(row([load(shoot(os.path.join(tmp, 'g%d_%d.png' % (pitch, i)), y, pitch)) for i, y in enumerate((-45, 0, 45))]))
    save(col(rows), os.path.join(OUT, PIECE + '-gamecam.png'))
    cap.hide_render = True
    c = shoot(os.path.join(tmp, 'close.png'), 0, 40, dist=DIST * 0.6, w=int(RES * 1.5), h=int(RES * 1.2))
    c2 = shoot(os.path.join(tmp, 'close2.png'), 30, 25, dist=DIST * 0.6, w=int(RES * 1.5), h=int(RES * 1.2))
    save(row([load(c), load(c2)]), os.path.join(OUT, PIECE + '-close.png'))
    cap.hide_render = False
if kit:
    cap.hide_render = True
    rows = []
    for objs in ([kit, ours] if ours else [kit]):
        show(objs)
        rows.append(row([load(shoot(os.path.join(tmp, 'k%d.png' % i), y, 40, dist=DIST * 0.72)) for i, y in enumerate((-35, 0, 35))]))
    save(col(rows), os.path.join(OUT, PIECE + ('-kitcmp.png' if ours else '-kitonly.png')))
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RV done', OUT)
