# Renders the bosses' GLBs (front and 3/4) for reference:  blender -b --factory-startup --python boss_render.py -- <out_dir> <glb> [<glb> ...]
import bpy, sys, os, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]; GLBS = argv[1:]
print('BR pid', os.getpid())
def s2l(x): return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
for src in GLBS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    scene = bpy.context.scene
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    dg = bpy.context.evaluated_depsgraph_get()
    for o in scene.objects:
        if o.type != 'MESH': continue
        oe = o.evaluated_get(dg); me = oe.to_mesh()
        for v in me.vertices:
            w = oe.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        oe.to_mesh_clear()
    c = (lo + hi) / 2; r = max((hi - lo).length / 2, 0.2)
    sun = bpy.data.objects.new('s', bpy.data.lights.new('s', 'SUN')); scene.collection.objects.link(sun); sun.data.energy = 2.0
    kd = Vector((1.5, -3.0, 4.0)).normalized(); sun.rotation_euler = (-kd).to_track_quat('-Z', 'Y').to_euler()
    world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (s2l(0.95), s2l(0.93), s2l(0.97), 1); bg.inputs['Strength'].default_value = 0.8
    eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in eng else 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'Standard'
    cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.angle = math.radians(30)
    scene.render.resolution_x = scene.render.resolution_y = 640
    name = os.path.splitext(os.path.basename(src))[0]
    for vn, d in (('front', (0, -1, 0.15)), ('q', (0.9, -1, 0.5)), ('back', (-0.4, 1, 0.3))):
        d = Vector(d).normalized(); cam.location = c + d * (r / math.sin(math.radians(15)) * 1.05)
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(OUT, '%s-%s.png' % (name, vn)); bpy.ops.render.render(write_still=True)
    print('BR', name, 'size', tuple(round(x, 3) for x in (hi - lo)))
