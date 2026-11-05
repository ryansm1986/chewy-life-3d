# shop-12: per GLB the triangles, size (game axes), the window_glow bounds against the kit dump's glow bounds.
#   blender --background --factory-startup --python check_glb.py
import bpy, bmesh, os, json
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
kit = json.load(open(os.path.join(HERE, 'kitdump', 'kit-info.json')))
out = {}
for L in (1, 2):
    for v in range(8):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        path = os.path.join(REPO, 'public', 'models', 'shop-%d-v%d.glb' % (L, v))
        bpy.ops.import_scene.gltf(filepath=path)
        tris = 0; lo = Vector((1e9,) * 3); hi = -lo; glo = Vector((1e9,) * 3); ghi = -glo; mats = set()
        for o in bpy.context.scene.objects:
            if o.type != 'MESH': continue
            bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); tris += len(bm.faces); bm.free()
            isg = any(s.material and 'glow' in s.material.name for s in o.material_slots)
            for s in o.material_slots: mats.add(s.material.name if s.material else None)
            for vv in o.data.vertices:
                w = o.matrix_world @ vv.co; g = Vector((w.x, w.z, -w.y))     # game x, y, z
                lo = Vector(map(min, lo, g)); hi = Vector(map(max, hi, g))
                if isg: glo = Vector(map(min, glo, g)); ghi = Vector(map(max, ghi, g))
        k = kit['%d:%d' % (L, v)]
        rec = dict(tris=tris, kb=round(os.path.getsize(path) / 1024, 1), size=[round(x, 2) for x in (hi - lo)],
                   bb=[[round(x, 2) for x in lo], [round(x, 2) for x in hi]], kit_bb=[[round(x, 2) for x in k['bb']['body'][0]], [round(x, 2) for x in k['bb']['body'][1]]],
                   glow=[[round(x, 2) for x in glo], [round(x, 2) for x in ghi]], kit_glow=k['bb']['glow'], mats=sorted(mats))
        out['shop-%d-v%d' % (L, v)] = rec
        print('CK shop-%d-v%d' % (L, v), json.dumps(rec))
json.dump(out, open(os.path.join(HERE, 'preview', 'check.json'), 'w'), indent=1)
