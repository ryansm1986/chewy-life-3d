"""The sun wagasa sheet: public/models/stella-parasol.glb from the side, 3/4 above, the top and below, next to the sheet's
callout (refs/sheet-sun.png).   blender --background --factory-startup --python wagasa_views.py   -> preview/wagasa.png"""
import bpy, math, os
import numpy as np
from mathutils import Vector
ROOT = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(ROOT, 'preview'); SCR = os.path.join(ROOT, 'scratch')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='D:/projects/chewy-life-3d/public/models/stella-parasol.glb')
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT'
try: sc.eevee.taa_render_samples = 24
except Exception: pass
sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'PNG'; sc.render.film_transparent = True
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.60, .55, .50, 1); sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
sc.use_nodes = True; nt = sc.node_tree; nt.nodes.clear()
rl = nt.nodes.new('CompositorNodeRLayers'); ov = nt.nodes.new('CompositorNodeAlphaOver'); ov.inputs[1].default_value = (.95, .94, .92, 1)
nt.links.new(rl.outputs['Image'], ov.inputs[2]); cp = nt.nodes.new('CompositorNodeComposite'); nt.links.new(ov.outputs[0], cp.inputs[0])
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.clip_start = .05; cam.data.clip_end = 60
for nm, rel, pw, col in (('key', (-2.2, 1.9, 1.0), 175, (1, .92, .86)), ('fill', (2.4, -.4, .6), 85, (.88, .92, 1)), ('rim', (.8, 2.6, -2.8), 120, (1, .88, .76))):
    d = bpy.data.lights.new(nm, 'AREA'); d.energy = pw; d.shape = 'DISK'; d.size = 3.0; d.color = col
    o = bpy.data.objects.new(nm, d); sc.collection.objects.link(o); o.parent = cam; o.location = rel
    o.rotation_euler = (Vector((0, 0, -3.2)) - Vector(rel)).to_track_quat('-Z', 'Y').to_euler()
fin = bpy.data.objects.get('finial'); print('FINIAL', None if fin is None else tuple(round(c, 4) for c in fin.matrix_world.translation))
print('NODES', sorted(o.name for o in bpy.data.objects if o.type in ('MESH', 'EMPTY')))
print('MATERIALS', sorted(m.name for m in bpy.data.materials))
def aim(loc, target, ortho):
    cam.location = loc; cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
paths = []
def shot(k, res=520):
    p = os.path.join(SCR, '_wv_%d.png' % k); sc.render.resolution_x = sc.render.resolution_y = res; sc.render.filepath = p
    bpy.ops.render.render(write_still=True); paths.append(p)
T = Vector((0, 0, .22))
aim(T + Vector((0, -1, .08)).normalized() * 5, T, 1.05); shot(0)                  # side (glTF import: Blender Z up again)
aim(Vector((0, 0, .42)) + Vector((.55, -.65, .52)).normalized() * 5, Vector((0, 0, .42)), .95); shot(1)   # 3/4 from above
aim(Vector((0, 0, .5)) + Vector((0, -.001, 1)) * 5, Vector((0, 0, .5)), .90); shot(2)                     # top
aim(Vector((0, 0, .3)) + Vector((0, -.35, -1)).normalized() * 5, Vector((0, 0, .3)), .95); shot(3)        # below
# the sheet's callout beside them
im_ = bpy.data.images.load(os.path.join(ROOT, 'refs', 'sheet-sun.png')); W_, H_ = im_.size
a = np.empty(W_ * H_ * 4, np.float32); im_.pixels.foreach_get(a); a = a.reshape(H_, W_, 4)
x0, y0, x1, y1 = 1095, 545, 1525, 795                   # (sheet px, top-left origin)
crop = a[H_ - y1:H_ - y0, x0:x1]
ims = [bpy.data.images.load(p) for p in paths]; w = h = 520
cols = 4; canvas = np.ones((h * 2, w * cols, 4), np.float32)
for i, im in enumerate(ims):
    b = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(b); canvas[h:2 * h, i * w:(i + 1) * w] = b.reshape(h, w, 4)
# the callout scaled to the bottom row (nearest), centred
ch, cw = crop.shape[:2]; s = min(2 * w / cw, h / ch); nh, nw = int(ch * s), int(cw * s)
yi = (np.arange(nh) / s).astype(int).clip(0, ch - 1); xi = (np.arange(nw) / s).astype(int).clip(0, cw - 1)
big = crop[yi][:, xi]; ox = (w * cols - nw) // 2; canvas[(h - nh) // 2:(h - nh) // 2 + nh, ox:ox + nw] = big
img = bpy.data.images.new('wv', w * cols, h * 2); img.pixels.foreach_set(canvas.ravel()); img.filepath_raw = os.path.join(OUT, 'wagasa.png'); img.file_format = 'PNG'; img.save()
for p in paths: os.remove(p)
print('WAGASA_VIEWS_DONE')
