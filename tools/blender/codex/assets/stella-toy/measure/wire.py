"""wireframe close-up of the face: blender -b --factory-startup --python measure/wire.py -- IN.glb OUT.png [cx cz half] [yaw_deg]"""
import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]; cx = float(a[2]) if len(a) > 2 else 0.; cz = float(a[3]) if len(a) > 3 else .88
half = float(a[4]) if len(a) > 4 else .14; yaw = math.radians(float(a[5])) if len(a) > 5 else 0.
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'SINGLE'; sc.display.shading.single_color = (.8, .8, .8)
sc.display.shading.show_cavity = False
for o in list(sc.objects):
    if o.type == 'MESH' and not o.name.startswith('Stella_head'): o.hide_render = True
    elif o.type == 'MESH':
        w = o.copy(); w.data = o.data.copy(); sc.collection.objects.link(w)
        m = w.modifiers.new('w', 'WIREFRAME'); m.thickness = .0006; m.use_replace = True
        mat = bpy.data.materials.new('k'); mat.diffuse_color = (0, 0, 0, 1); w.data.materials.clear(); w.data.materials.append(mat)
sc.display.shading.color_type = 'MATERIAL'
for o in sc.objects:
    if o.type == 'MESH' and o.name.startswith('Stella_head') and not o.modifiers:
        mat = bpy.data.materials.new('g'); mat.diffuse_color = (.85, .85, .85, 1); o.data.materials.clear(); o.data.materials.append(mat)
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2 * half
t = Vector((cx, -.2, cz)); d = Vector((math.sin(yaw), -math.cos(yaw), 0)); cam.location = t + d * 3
cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.resolution_x = sc.render.resolution_y = 1000; sc.render.filepath = out; bpy.ops.render.render(write_still=True)
