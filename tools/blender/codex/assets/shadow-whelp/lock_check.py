"""Prove the lock: the whelp's Shadow (head, face, eyes, ears, body, legs, paws, collar, tag, tail) is the approved
shadow-toy, unchanged.

    blender --background --factory-startup --python lock_check.py

1. A fresh, unmodified run of the archived build (the archive file's own bytes, MD5-checked) up to its joints marker,
   object by object, against lock-parts.npz (what build_shadow-whelp.py shipped): max vertex delta, and the UVs in
   atlas pixels (the whelp atlas is 2048 x 2304: his 2048 rows are kept at the same pixel rows).
2. The shipping public/models/shadow-toy.glb against public/models/shadow-whelp.glb, imported: every Shadow_* object
   vertex by vertex (world space), and its UVs in pixels.
3. The atlas: every one of his charts, pixel by pixel, shadow-toy.glb's texture against shadow-whelp.glb's.
Writes lock-check.json.
"""
import bpy, os, json, hashlib
import numpy as np
TASK = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(TASK, 'base', 'build_shadow-toy.py')
ARCHIVE = 'D:/projects/chewy-life-3d/tools/blender/codex/assets/shadow-toy/build_shadow-toy.py'
TOY = 'D:/projects/chewy-life-3d/public/models/shadow-toy.glb'
WHELP = 'D:/projects/chewy-life-3d/public/models/shadow-whelp.glb'
MARK = '# ------------------------------------------------------------------ joints'
raw = open(ARCHIVE, 'rb').read()
out = {'archive_md5': hashlib.md5(raw).hexdigest(), 'base_copy_md5': hashlib.md5(open(BASE, 'rb').read()).hexdigest()}
src = raw.decode('utf-8')
ns = {'__file__': BASE, '__name__': 'shadow_reference'}            # (its atlas PNG lands in base/, never in the archive)
exec(compile(src[:src.index(MARK)], BASE, 'exec'), ns)
CH = dict(ns['CHARTS'])
ref = {}
for o in ns['objects']:
    co = np.array([tuple(o.matrix_world @ v.co) for v in o.data.vertices])
    uvl = o.data.uv_layers.active.data; uv = np.empty(len(uvl) * 2); uvl.foreach_get('uv', uv)
    ref[o.name] = (co, uv.reshape(-1, 2) * 2048.0)
kept = np.load(os.path.join(TASK, 'lock-parts.npz'))
per = {}
for nm, (co, uvpx) in ref.items():
    P = kept[nm + '__co']; U = kept[nm + '__uvpx']
    per[nm] = {'vertices': int(len(P)), 'max_vertex_delta_m': float(np.abs(P - co).max()) if P.shape == co.shape else 'SHAPE MISMATCH',
               'max_uv_delta_px': float(np.abs(U - uvpx).max()) if U.shape == uvpx.shape else 'SHAPE MISMATCH'}
out['vs_fresh_unmodified_build'] = per

def load(path, h):
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=path)
    obs = {}
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or not o.name.startswith('Shadow_'): continue
        co = np.array([tuple(o.matrix_world @ v.co) for v in o.data.vertices])
        uvl = o.data.uv_layers.active.data; uv = np.empty(len(uvl) * 2); uvl.foreach_get('uv', uv)
        obs[o.name] = (co, uv.reshape(-1, 2) * np.array([2048.0, h]))
    img = [i for i in bpy.data.images if i.size[0] == 2048 and i.size[1] == h][0]
    px = np.empty(2048 * h * 4, np.float32); img.pixels.foreach_get(px)
    return obs, np.round(px.reshape(h, 2048, 4) * 255).astype(np.int16)
old, old_px = load(TOY, 2048)
new, new_px = load(WHELP, 2304)
glb = {}
for nm in sorted(old):
    a, ua = old[nm]; b, ub = new[nm]
    glb[nm] = {'vertices': [int(len(a)), int(len(b))],
               'max_vertex_delta_m': float(np.abs(a - b).max()) if a.shape == b.shape else 'SHAPE MISMATCH',
               'max_uv_delta_px': float(np.abs(ua - ub).max()) if ua.shape == ub.shape else 'SHAPE MISMATCH'}
out['glb_shadow_toy_vs_whelp'] = glb
out['glb_objects'] = {'shadow-toy': sorted(old), 'shadow-whelp (Shadow_*)': sorted(new)}
atl = {}
for nm, (x, y, w, h) in CH.items():
    atl[nm] = int(np.abs(old_px[y:y + h, x:x + w, :3] - new_px[y:y + h, x:x + w, :3]).max())
atl['all 2048 x 2048 rows'] = int(np.abs(old_px[:, :, :3] - new_px[:2048, :, :3]).max())
out['atlas_charts_max_diff_8bit'] = atl
groups = {'head and face (head, nose, muzzle, smile)': ['Shadow_head'], 'eyes': ['Shadow_eye_L', 'Shadow_eye_R'],
          'ears': ['Shadow_ear_L', 'Shadow_ear_R'], 'body, legs, paws, collar, tag': ['Shadow_body'], 'tail': ['Shadow_tail']}
summary = {}
for g, names in groups.items():
    summary[g] = max(max(per[n]['max_vertex_delta_m'], glb[n]['max_vertex_delta_m']) for n in names)
summary['UVs in atlas pixels (fresh build and GLB)'] = max(max(per[n]['max_uv_delta_px'], glb[n]['max_uv_delta_px']) for n in per)
summary['atlas, his charts (8-bit levels)'] = max(atl.values())
out['summary'] = summary
json.dump(out, open(os.path.join(TASK, 'lock-check.json'), 'w', encoding='utf-8'), indent=1)
print('LOCK_SUMMARY', json.dumps(summary))
