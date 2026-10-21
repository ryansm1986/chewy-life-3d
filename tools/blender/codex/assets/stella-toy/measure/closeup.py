"""textured close-up (render_views lights): blender -b --factory-startup --python measure/closeup.py -- IN.glb OUT.png cx cz half [yaw] [flat]"""
import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]; cx, cz, half = float(a[2]), float(a[3]), float(a[4]); yaw = math.radians(float(a[5])) if len(a) > 5 else 0.
flat = len(a) > 6 and a[6] == 'flat'
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.view_settings.view_transform = 'Standard'
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.6, .55, .5, 1); sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2 * half
t = Vector((cx, -.2, cz)); d = Vector((math.sin(yaw), -math.cos(yaw), 0)); cam.location = t + d * 3
cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
def light(name, rel_, power, size):
    L = bpy.data.lights.new(name, 'AREA'); L.energy = power; L.size = size; o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.parent = cam; o.location = rel_
    o.rotation_euler = (Vector((0, 0, -3.2)) - o.location).to_track_quat('-Z', 'Y').to_euler()
light('key', (-2.2, 1.9, 1.0), 175, 3.0); light('fill', (2.4, -.4, .6), 85, 3.0)
if flat:
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        nt = m.node_tree; bs = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None); tx = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None)
        if bs and tx:
            em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(tx.outputs['Color'], em.inputs['Color'])
            out_ = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'); nt.links.new(em.outputs[0], out_.inputs['Surface'])
sc.render.resolution_x = sc.render.resolution_y = 900; sc.render.filepath = out; bpy.ops.render.render(write_still=True)
