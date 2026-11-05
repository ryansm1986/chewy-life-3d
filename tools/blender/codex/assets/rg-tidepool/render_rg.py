# Review renders for an rg-tidepool prop (beyond the standard preview.py):
#   blender --background --factory-startup --python render_rg.py -- --piece <name> [--glb <glb>] [--kit <obj>]
#           [--ground sand|water] [--water 0.05] [--res 560]
# Writes preview/<piece>-gamecam.png: rows 18 m | 10 m; columns pitch 45 yaw -45, 45/+45, 35/-45, 35/+45, beside a 1 m
# capsule; preview/<piece>-kitcmp.png: the kit dump (top) | ours (bottom) at the same cameras (18 m, both pitches, -45);
# preview/<piece>-close.png: three close views of ours.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
HERE = os.path.dirname(os.path.abspath(__file__))
PIECE = arg('--piece'); GLB = arg('--glb'); KIT = arg('--kit'); GROUND = arg('--ground', 'sand')
WATER = float(arg('--water', '0.05')); RES = int(arg('--res', '560')); DS = float(arg('--dscale', '1'))
OUT = os.path.join(HERE, 'preview'); os.makedirs(OUT, exist_ok=True)
print('RG render pid', os.getpid())

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lin(h): h = h.lstrip('#'); return tuple(s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)
def flat_mat(name, hexc, rough=0.9, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: m.blend_method = 'BLEND'
    return m

ours, kit = [], []
if GLB:
    before = set(scene.objects); bpy.ops.import_scene.gltf(filepath=os.path.abspath(GLB))
    ours = [o for o in scene.objects if o not in before and o.type == 'MESH']
if KIT:
    before = set(scene.objects)
    bpy.ops.wm.obj_import(filepath=os.path.abspath(KIT), forward_axis='NEGATIVE_Z', up_axis='Y')
    kit = [o for o in scene.objects if o not in before and o.type == 'MESH']
    km = bpy.data.materials.new('kitvc'); km.use_nodes = True; nt = km.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); b.inputs['Roughness'].default_value = 0.85
    vc = nt.nodes.new('ShaderNodeVertexColor')
    nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
    for o in kit:
        if o.data.color_attributes: vc.layer_name = o.data.color_attributes[0].name
        o.data.materials.clear(); o.data.materials.append(km)
        if 'glow' in o.name:
            gm = km.copy(); g2 = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            g2.inputs['Emission Color'].default_value = lin('#ffd890'); g2.inputs['Emission Strength'].default_value = 0.6
            o.data.materials.clear(); o.data.materials.append(gm)
# glow materials of ours: a soft emission so they read lit
for o in ours:
    for s in o.material_slots:
        if s.material and s.material.name.split('.')[0] in ('glow', 'hot'):
            nt = s.material.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
            vc = next((n for n in nt.nodes if n.type == 'VERTEX_COLOR'), None)
            if vc is None: vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Color'
            for l in list(b.inputs['Emission Color'].links): nt.links.remove(l)
            src = b.inputs['Base Color'].links[0].from_socket if b.inputs['Base Color'].links else vc.outputs['Color']
            nt.links.new(src, b.inputs['Emission Color'])
            b.inputs['Emission Strength'].default_value = 0.6 if s.material.name.startswith('glow') else 1.0

allm = ours or kit
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in allm:
    for v in o.data.vertices:
        w = o.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
centre = (lo + hi) / 2
print('RG bounds', tuple(round(c, 3) for c in lo), tuple(round(c, 3) for c in hi))

bpy.ops.mesh.primitive_plane_add(size=80, location=(centre.x, centre.y, -0.003))
ground = bpy.context.object; ground.data.materials.append(flat_mat('rv_ground', '#e6d6a6'))
if GROUND == 'water':
    ground.location.z = -0.6; ground.data.materials[0] = flat_mat('rv_bed', '#c8c098')
    bpy.ops.mesh.primitive_plane_add(size=80, location=(centre.x, centre.y, WATER))
    bpy.context.object.data.materials.append(flat_mat('rv_water', '#4fc4d0', rough=0.25, alpha=0.55))
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.56, location=(0, 0, 0.5)); cap = bpy.context.object
for dz in (0.28, -0.28):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 0.5 + dz)); s = bpy.context.object
    s.select_set(True); cap.select_set(True); bpy.context.view_layer.objects.active = cap; bpy.ops.object.join()
bpy.ops.object.shade_smooth()
cap.data.materials.append(flat_mat('rv_cap', '#9a7ae0'))
cap.location = Vector((lo.x - 0.6, lo.y - 0.6, WATER if GROUND == 'water' else 0))
sun = bpy.data.objects.new('rv_sun', bpy.data.lights.new('rv_sun', 'SUN')); scene.collection.objects.link(sun)
sun.data.energy = 2.6; sun.data.angle = math.radians(12); sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
world = bpy.data.worlds.new('rv_world'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.75, 0.82, 0.95, 1); bg.inputs['Strength'].default_value = 0.7
eng = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.engine = eng
try: scene.eevee.taa_render_samples = 24
except Exception: pass
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
cam = bpy.data.objects.new('rv_cam', bpy.data.cameras.new('rv_cam')); scene.collection.objects.link(cam); scene.camera = cam

def show(which):
    for o in ours: o.hide_render = which != 'ours'
    for o in kit: o.hide_render = which != 'kit'

def shoot(path, yaw_deg, pitch_deg=45, dist=18, lens=60, target=None, w=RES, h=RES):
    t = target if target is not None else Vector((centre.x, centre.y, max(0.0, lo.z) + (hi.z - max(0.0, lo.z)) * 0.4))
    dist = dist * DS
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
    h = max(a.shape[0] for a in arrs); parts = []
    for i, a in enumerate(arrs):
        if i: parts.append(np.ones((h, gap, 4), np.float32))
        parts.append(a)
    return np.hstack(parts)
def col(arrs, gap=6):
    w = max(a.shape[1] for a in arrs); parts = []
    for i, a in enumerate(arrs[::-1]):
        if i: parts.append(np.ones((gap, w, 4), np.float32))
        parts.append(a)
    return np.vstack(parts)

tmp = os.path.join(OUT, '_rv'); os.makedirs(tmp, exist_ok=True)
VIEWS = ((45, -45), (45, 45), (35, -45), (35, 45))
if ours:
    show('ours')
    rows = []
    for dist in (18, 10):
        rows.append(row([load(shoot(os.path.join(tmp, 'g%d%d.png' % (dist, i)), y, pitch_deg=p, dist=dist)) for i, (p, y) in enumerate(VIEWS)]))
    save(col(rows), os.path.join(OUT, PIECE + '-gamecam.png'))
    cap.hide_render = True
    tz = Vector((centre.x, centre.y, (max(0.0, lo.z) + hi.z) * 0.45))
    cl = [load(shoot(os.path.join(tmp, 'c%d.png' % i), y, pitch_deg=p_, dist=d_, lens=50, target=tz)) for i, (y, p_, d_) in
          enumerate(((-30, 25, 8), (30, 25, 8), (160, 30, 8), (-90, 40, 8)))]
    save(col([row(cl[:2]), row(cl[2:])]), os.path.join(OUT, PIECE + '-close.png')); cap.hide_render = False
if kit:
    rows = []
    for which in ('kit', 'ours') if ours else ('kit',):
        show(which)
        rows.append(row([load(shoot(os.path.join(tmp, 'k%s%d.png' % (which, i)), y, pitch_deg=p, dist=d)) for i, (p, y, d) in
                         enumerate(((45, -45, 18), (35, 45, 18), (35, -45, 10)))]))
    save(col(rows), os.path.join(OUT, PIECE + ('-kitcmp.png' if ours else '-kitonly.png')))
print('RG done')
