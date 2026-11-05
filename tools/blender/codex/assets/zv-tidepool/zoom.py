# a zoomed review render: blender -b -P zoom.py -- --in <glb> --out <png> --t x,y,z (game coords) --yaw d --pitch d --dist m [--hide saved,siege]
import bpy, sys, math, os
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
def arg(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(arg('--in')))
sc = bpy.context.scene
for o in sc.objects:
    for hname in (arg('--hide', 'siege') or '').split(','):
        if hname and (o.name.startswith(hname) or (o.parent and o.parent.name.startswith(hname))): o.hide_render = True
gx, gy, gz = [float(v) for v in arg('--t', '0,1,0').split(',')]
t = Vector((gx, -gz, gy))
sun = bpy.data.objects.new('s', bpy.data.lights.new('s', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 2.6; sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.82, 0.95, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.view_settings.view_transform = 'Standard'
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
yaw, pitch, dist = math.radians(float(arg('--yaw', '0'))), math.radians(float(arg('--pitch', '35'))), float(arg('--dist', '4'))
d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
cam.location = t + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 50
sc.render.resolution_x = int(arg('--w', '900')); sc.render.resolution_y = int(arg('--h', '700'))
sc.render.filepath = os.path.abspath(arg('--out')); bpy.ops.render.render(write_still=True)
