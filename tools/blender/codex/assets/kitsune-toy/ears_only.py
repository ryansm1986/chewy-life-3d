"""Ears-only review renders (the head and body hidden): front, side, and the 45-deg-down game camera from both yaws.
    blender --background --factory-startup --python ears_only.py      -> preview/ears_front|side|g45p|g45m.png, preview/ears.png"""
import bpy, math, os
import numpy as np
from mathutils import Vector
ROOT = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(ROOT, 'preview')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='D:/projects/chewy-life-3d/public/models/kitsune-toy.glb')
sc = bpy.context.scene
for o in sc.objects:
    if o.type == 'MESH' and not o.name.startswith('Kitsune_ear'): o.hide_render = True
sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.view_settings.view_transform = 'Standard'; sc.render.film_transparent = False
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
bg = sc.world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (.93, .90, .86, 1); bg.inputs['Strength'].default_value = 1.0
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
d = bpy.data.lights.new('key', 'SUN'); d.energy = 3.0; k = bpy.data.objects.new('key', d); sc.collection.objects.link(k)
k.rotation_euler = (Vector((0, 0, 0)) - Vector((-1.5, -2.5, 3))).to_track_quat('-Z', 'Y').to_euler()
cam.data.type = 'ORTHO'; cam.data.ortho_scale = .80; t = Vector((0, -.04, 1.00))
views = {'front': Vector((0, -1, 0)), 'side': Vector((1, 0, 0)),
         'g45p': Vector((math.sin(math.radians(45)) * .707, -math.cos(math.radians(45)) * .707, .707)),
         'g45m': Vector((-math.sin(math.radians(45)) * .707, -math.cos(math.radians(45)) * .707, .707))}
paths = []
for nm, dv in views.items():
    cam.location = t + dv.normalized() * 4; cam.rotation_euler = (-dv).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x = sc.render.resolution_y = 600; p = os.path.join(OUT, 'ears_%s.png' % nm); sc.render.filepath = p
    bpy.ops.render.render(write_still=True); paths.append(p)
ims = [bpy.data.images.load(p) for p in paths]; W_ = 600
canvas = np.ones((W_, W_ * 4 + 30, 4), np.float32)
for i, im in enumerate(ims):
    px = np.empty(W_ * W_ * 4, np.float32); im.pixels.foreach_get(px); canvas[:, i * (W_ + 10):i * (W_ + 10) + W_] = px.reshape(W_, W_, 4)
out = bpy.data.images.new('ears', W_ * 4 + 30, W_); out.pixels.foreach_set(canvas.ravel()); out.filepath_raw = os.path.join(OUT, 'ears.png'); out.file_format = 'PNG'; out.save()
print('EARS_DONE')
