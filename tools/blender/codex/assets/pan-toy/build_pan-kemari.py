"""Pan's kemari ball (the sheet's callout: 0.13 m, cream #F4E8D5 with rose panels #E87983). Blender 4.3. Deterministic.

    blender --background --factory-startup --python build_pan-kemari.py

A lat-long sphere (explicit UVs) with a painted 512 x 256 equirect texture: six round rose panels at the faces of a
tilted cube, crisp borders, soft painted shading. Lowest point at z = 0, centred. Writes public/models/pan-kemari.glb.
"""
import bpy, math, os, struct, zlib
import numpy as np
ROOT = os.path.dirname(os.path.abspath(__file__))
MODEL = 'D:/projects/chewy-life-3d/public/models/pan-kemari.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
R = .065; NU, NV = 48, 24
def rgb(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
def smooth(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
# panels: the six cube-face directions, tilted so the ball shows three panels from the front, as on the sheet
a, b = math.radians(35), math.radians(28)
Rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
Rz = np.array([[math.cos(b), -math.sin(b), 0], [math.sin(b), math.cos(b), 0], [0, 0, 1]])
PANELS = (np.vstack([np.eye(3), -np.eye(3)]) @ (Rz @ Rx).T)
def paint(d):
    cosmax = (d @ PANELS.T).max(-1); ang = np.degrees(np.arccos(np.clip(cosmax, -1, 1)))
    m = 1 - smooth(31.0, 32.5, ang)
    C = rgb('#f4e8d5') * (1 - m[..., None]) + rgb('#e87983') * m[..., None]
    light = d @ (np.array([-.3, -.4, .87]) / np.linalg.norm([-.3, -.4, .87]))
    shade = .90 + .10 * smooth(-.6, .8, light)
    return np.clip(C * shade[..., None], 0, 1)
TW, TH = 512, 256
uu, vv = np.meshgrid((np.arange(TW) + .5) / TW, (np.arange(TH) + .5) / TH)
lon = uu * 2 * math.pi; lat = (vv - .5) * math.pi
D = np.stack([np.cos(lat) * np.sin(lon), -np.cos(lat) * np.cos(lon), np.sin(lat)], -1)
img_px = (np.clip(paint(D.reshape(-1, 3)).reshape(TH, TW, 3), 0, 1) * 255).round().astype(np.uint8)
rgba = np.concatenate([img_px, np.full((TH, TW, 1), 255, np.uint8)], -1)
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
path = os.path.join(ROOT, 'pan-kemari_tex.png')
raw = b''.join(b'\x00' + r.tobytes() for r in rgba[::-1])
with open(path, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', TW, TH, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
# lat-long mesh with a UV seam (duplicated column) and pole fans
V = []; UV = []; F = []; FUV = []
for j in range(1, NV):
    la = -math.pi / 2 + math.pi * j / NV
    for i in range(NU + 1):
        lo = 2 * math.pi * i / NU
        V.append((R * math.cos(la) * math.sin(lo), -R * math.cos(la) * math.cos(lo), R + R * math.sin(la))); UV.append((i / NU, j / NV))
ix = lambda j, i: (j - 1) * (NU + 1) + i
for j in range(1, NV - 1):
    for i in range(NU): F.append((ix(j, i), ix(j, i + 1), ix(j + 1, i + 1), ix(j + 1, i)))
bot = len(V); V.append((0, 0, 0)); top = len(V); V.append((0, 0, 2 * R))
for i in range(NU):
    F.append((bot, ix(1, i + 1), ix(1, i))); F.append((ix(NV - 1, i), ix(NV - 1, i + 1), top))
me = bpy.data.meshes.new('kemari_ball'); me.from_pydata(V, [], F); me.update()
uvl = me.uv_layers.new(name='UV')
for p in me.polygons:
    p.use_smooth = True
    for li in p.loop_indices:
        vi = me.loops[li].vertex_index
        if vi in (bot, top):
            others = [me.loops[k].vertex_index for k in p.loop_indices if me.loops[k].vertex_index not in (bot, top)]
            u = sum(UV[o][0] for o in others) / len(others); uvl.data[li].uv = (u, 0. if vi == bot else 1.)
        else: uvl.data[li].uv = UV[vi]
ob = bpy.data.objects.new('Pan_kemari_ball', me); bpy.context.collection.objects.link(ob)
img = bpy.data.images.load(path); img.name = 'Pan_kemari_tex'; img.pack()
mat = bpy.data.materials.new('Pan_kemari'); mat.use_nodes = True
bs = mat.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value = .8; bs.inputs['Specular IOR Level'].default_value = .25
tx = mat.node_tree.nodes.new('ShaderNodeTexImage'); tx.image = img; mat.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
me.materials.append(mat)
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
bpy.ops.export_scene.gltf(filepath=MODEL, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_lights=False, export_cameras=False, export_animations=False)
print('KEMARI_DONE', len(me.polygons))
