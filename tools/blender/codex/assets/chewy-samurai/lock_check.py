"""Prove the lock: the samurai's head, face, ears, eyes, paws, arms, feet and tail are the approved chewy-b, unchanged.

    blender --background --factory-startup --python lock_check.py

1. A fresh, unmodified build of base/build_chewy-b.py (the archive's bytes) up to its pre-join marker, part by part,
   against lock-parts.npz (what build_chewy-samurai.py kept): max vertex delta per part.
2. The shipping public/models/chewy-b.glb against public/models/chewy-samurai.glb: head, eyes, ears and tail vertex by
   vertex; every kept body vertex (paws, thumbs, wrists, wraps, upper arms, ankles, feet, neck blaze) found in both bodies.
3. The atlas: every locked chart, pixel by pixel, chewy-b.glb's texture against chewy-samurai.glb's.
Writes lock-check.json.
"""
import bpy, os, json, hashlib
import numpy as np
from mathutils.kdtree import KDTree
TASK = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(TASK, 'base', 'build_chewy-b.py')
ARCHIVE = 'D:/projects/chewy-life-3d/tools/blender/codex/assets/chewy-b/build_chewy-b.py'
out = {'base_md5': hashlib.md5(open(BASE, 'rb').read()).hexdigest(), 'archive_md5': hashlib.md5(open(ARCHIVE, 'rb').read()).hexdigest()}
src = open(BASE, encoding='utf-8').read()
MARK = '# Record the actual authored parts before joining, for profile QA.'
ns = {'__file__': BASE, '__name__': 'chewy_b_reference'}
exec(compile(src[:src.index(MARK)], BASE, 'exec'), ns)
ref = {ob.name: np.array([v.co[:] for v in ob.data.vertices]) for obs in ns['parts'].values() for ob in obs}
CH = dict(ns['CHARTS'])
BODY_NAMES = [ob.name for ob in ns['parts']['body']]
kept = np.load(os.path.join(TASK, 'lock-parts.npz'))
kept = {k.replace('__', '.'): kept[k] for k in kept.files}
per = {}
for name, P in kept.items():
    R = ref[name]
    per[name] = {'vertices': int(len(P)), 'max_delta_m': float(np.abs(P - R).max()) if P.shape == R.shape else 'SHAPE MISMATCH'}
out['vs_fresh_unmodified_build'] = per
out['fresh_build_max_delta_m'] = max(v['max_delta_m'] for v in per.values())
out['costume_parts_in_reference_not_kept'] = sorted(set(ref) - set(kept))

def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=path)
    obs = {o.name: np.array([tuple(o.matrix_world @ v.co) for v in o.data.vertices]) for o in bpy.context.scene.objects if o.type == 'MESH'}
    img = [i for i in bpy.data.images if i.size[0] == 2048][0]
    px = np.empty(2048 * 2048 * 4, np.float32); img.pixels.foreach_get(px)
    return obs, np.round(px.reshape(2048, 2048, 4) * 255).astype(np.int16)
old, old_px = load('D:/projects/chewy-life-3d/public/models/chewy-b.glb')
new, new_px = load('D:/projects/chewy-life-3d/public/models/chewy-samurai.glb')
glb = {}
for nm in ('Chewy_head', 'Chewy_eye_L', 'Chewy_eye_R', 'Chewy_ear_L', 'Chewy_ear_R', 'Chewy_tail'):
    a, b = old[nm], new[nm]
    glb[nm] = {'vertices': [int(len(a)), int(len(b))], 'max_delta_m': float(np.abs(a - b).max()) if a.shape == b.shape else 'SHAPE MISMATCH'}
def kd(P):
    t = KDTree(len(P))
    for i, p in enumerate(P): t.insert(p, i)
    t.balance(); return t
kold, knew = kd(old['Chewy_body']), kd(new['Chewy_body'])
body = {}
for name, P in kept.items():
    if name not in BODY_NAMES: continue
    d_old = max(kold.find(p)[2] for p in P); d_new = max(knew.find(p)[2] for p in P)
    body[name] = {'vertices': int(len(P)), 'max_dist_to_chewy_b_glb_m': float(d_old), 'max_dist_to_samurai_glb_m': float(d_new)}
out['glb_head_eyes_ears_tail'] = glb
out['glb_kept_body_parts'] = body
out['glb_body_vertices'] = {'chewy_b': int(len(old['Chewy_body'])), 'samurai': int(len(new['Chewy_body']))}
atl = {}
for nm in ('head', 'eye', 'eye.R', 'fur', 'ear', 'cream', 'nose', 'dark', 'brow', 'wrap', 'foot'):
    x, y, w, h = CH[nm]
    a = old_px[y:y + h, x:x + w]; b = new_px[y:y + h, x:x + w]
    atl[nm] = int(np.abs(a - b).max())
out['atlas_locked_charts_max_diff_8bit'] = atl
groups = {'head and face': ['Chewy_head', 'Chewy_eye_L', 'Chewy_eye_R'], 'ears': ['Chewy_ear_L', 'Chewy_ear_R'], 'tail': ['Chewy_tail']}
summary = {g: max(glb[n]['max_delta_m'] for n in ns_) for g, ns_ in groups.items()}
def grp(prefixes): return max(max(v['max_dist_to_chewy_b_glb_m'], v['max_dist_to_samurai_glb_m']) for k, v in body.items() if k.startswith(prefixes))
summary['paws (mitten + thumb)'] = grp(('large_mitten_paw', 'short_thumb_bump'))
summary['arms (upper arm, wrap, wrist)'] = grp(('upper_arm_skin', 'thick_forearm_wrap', 'wrist_skin'))
summary['feet and ankles'] = grp(('broad_dog_foot', 'ankle'))
summary['neck blaze'] = grp(('visible_neck_blaze',))
summary['fresh unmodified build, all kept parts'] = out['fresh_build_max_delta_m']
summary['atlas locked charts (8-bit levels)'] = max(atl.values())
out['summary'] = summary
json.dump(out, open(os.path.join(TASK, 'lock-check.json'), 'w', encoding='utf-8'), indent=1)
print('LOCK_SUMMARY', json.dumps(summary))
