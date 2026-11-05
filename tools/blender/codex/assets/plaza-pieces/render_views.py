# Review renders for a plaza piece (beyond the standard preview.py):
#   blender --background --factory-startup --python render_views.py -- --in <glb> --out <dir> --piece <name>
#           [--kit <kit png> --kitbox x0,y0,x1,y1] [--standins burrow|fountain] [--dist 8]
# Writes <dir>/<piece>-gamecam.png (45 deg down at yaw -45 | 0 | +45, beside a 1 m capsule), <dir>/<piece>-close.png,
# <dir>/<piece>-kitcmp.png (the kit crop | ours, close front) and, with --standins, <dir>/<piece>-standins.png: the
# game-drawn parts (the Burrow's purple portal disc; the fountain's jets) added as render-only stand-ins.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
SRC = os.path.abspath(arg('--in')); OUT = os.path.abspath(arg('--out')); PIECE = arg('--piece', 'piece')
KIT = arg('--kit'); KITBOX = arg('--kitbox'); STANDINS = arg('--standins')
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
def flat_mat(name, hexc, rough=0.9, emit=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = lin(hexc); b.inputs['Roughness'].default_value = rough
    if emit: b.inputs['Emission Color'].default_value = lin(hexc); b.inputs['Emission Strength'].default_value = emit
    return m

# the water_glow material: show the vertex-coloured water (the game draws it with its own water look)
for m in bpy.data.materials:
    if 'water' in m.name and m.use_nodes:
        nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = next((a.name for o in asset for a in o.data.color_attributes), 'Col')
        nt.links.new(vc.outputs['Color'], b.inputs['Base Color']); b.inputs['Emission Strength'].default_value = 0.0
        b.inputs['Roughness'].default_value = 0.35

bpy.ops.mesh.primitive_plane_add(size=40, location=(centre.x, centre.y, -0.003))
ground = bpy.context.object; ground.data.materials.append(flat_mat('rv_ground', '#7cbc5a'))
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
    t = target if target is not None else Vector((centre.x, centre.y, hi.z * 0.42))
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
    h = max(a.shape[0] for a in arrs)
    out = [np.vstack([np.ones((h - a.shape[0], a.shape[1], 4), np.float32), a]) if a.shape[0] < h else a for a in arrs]
    parts = []
    for i, a in enumerate(out):
        if i: parts.append(np.ones((h, gap, 4), np.float32))
        parts.append(a)
    return np.hstack(parts)

tmp = os.path.join(OUT, '_rv_' + PIECE); os.makedirs(tmp, exist_ok=True)
shots = [shoot(os.path.join(tmp, 'g%d.png' % i), y) for i, y in enumerate((-45, 0, 45))]
save(row([load(p) for p in shots]), os.path.join(OUT, PIECE + '-gamecam.png'))
close = shoot(os.path.join(tmp, 'close.png'), 0, 45, dist=DIST * 0.62)
os.replace(close, os.path.join(OUT, PIECE + '-close.png')); close = os.path.join(OUT, PIECE + '-close.png')
if KIT and KITBOX:
    x0, y0, x1, y1 = [int(v) for v in KITBOX.split(',')]
    k = load(KIT); H = k.shape[0]
    crop = k[H - y1:H - y0, x0:x1]
    ours = load(close)
    sc = ours.shape[0] / crop.shape[0]
    yi = (np.arange(ours.shape[0]) / sc).astype(int).clip(0, crop.shape[0] - 1)
    xi = (np.arange(int(crop.shape[1] * sc)) / sc).astype(int).clip(0, crop.shape[1] - 1)
    save(row([crop[yi][:, xi], ours]), os.path.join(OUT, PIECE + '-kitcmp.png'))
if STANDINS:
    cap.hide_render = True
    if STANDINS == 'burrow':     # the kit's portal: disc r 0.61 at (0, 0.72) game z -0.12; spinning arcs; a core
        bpy.ops.mesh.primitive_circle_add(vertices=32, radius=0.6, fill_type='NGON', location=(0, 0.12, 0.72), rotation=(math.pi / 2, 0, 0))
        bpy.context.object.data.materials.append(flat_mat('rv_portal', '#a060f0', emit=2.0))
        for k, (r, c) in enumerate(((0.14, '#f0b0ff'), (0.28, '#c080ff'), (0.42, '#a060f0'))):
            bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.035, location=(0, 0.06, 0.72), rotation=(math.pi / 2, 0, k * 2.1))
            bpy.context.object.data.materials.append(flat_mat('rv_arc%d' % k, c, emit=3.0))
    else:                        # the fountain's jets: six arcs from the petal tips, the central jet
        jm = flat_mat('rv_jet', '#c8f0ff', rough=0.3, emit=0.4)
        for k in range(6):
            a = -k / 6 * math.tau
            pts = []
            for i in range(9):
                t = i / 8; r = 0.47 + t * 0.24; y = 1.08 + 0.04 * math.sin(t * math.pi) - t * t * 0.77
                pts.append((math.cos(a) * r, math.sin(a) * r, y))
            cu = bpy.data.curves.new('jet%d' % k, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.03
            sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
            for p, q in zip(sp.points, pts): p.co = (q[0], q[1], q[2], 1)
            ob = bpy.data.objects.new('jet%d' % k, cu); scene.collection.objects.link(ob); cu.materials.append(jm)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=0.34, location=(0, 0, 1.44)); bpy.context.object.data.materials.append(jm)
    a = shoot(os.path.join(tmp, 's0.png'), 0, 45, dist=DIST * 0.62)
    b = shoot(os.path.join(tmp, 's1.png'), 45, 45, dist=DIST * 0.62)
    save(row([load(a), load(b)]), os.path.join(OUT, PIECE + '-standins.png'))
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('RV done', OUT)
