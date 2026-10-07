"""Validation of shihtzu-toy_rig.blend and the hero export (export/shihtzu_toy.json + .bin) -> validation.json
    blender --background --factory-startup --python validate.py
Checks: the 37 contract bones and parents; every hero mesh has only an Armature modifier; finite positions and normals;
<= 4 influences summing to 1; no degenerate triangles; the export's buffers (finite, weights summing to 255, indices in range)
and its triangle count against the rig; outward winding (each exported triangle's winding normal agrees with its vertex
normals); the lock: every approved mesh at rest matches public/models/shihtzu-toy.glb (vertex distance) and the approved
atlas is pixel-identical outside the new lid / cavity / tongue charts."""
import bpy, json, os, math
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
T = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(T, 'shihtzu-toy_rig.blend'))
arm = bpy.data.objects['Shihtzu_Rig']
HERO = json.load(open(os.path.join(T, 'joints-rig.json')))['bones']
out = {'bones': {'count': len(arm.data.bones), 'contract_ok': all(arm.data.bones.get(b['name']) is not None and
        ((arm.data.bones[b['name']].parent.name if arm.data.bones[b['name']].parent else None) == b['parent']) for b in HERO) and len(arm.data.bones) == 37}}
meshes = {}; tri_total = 0; problems = []
REST = {}
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    mods = [m.type for m in o.modifiers]
    hero = any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers) and not o.hide_render
    me = o.data; me.calc_loop_triangles()
    V = np.array([tuple(v.co) for v in me.vertices]); finite = bool(np.isfinite(V).all()); REST[o.name] = V
    N = np.array([tuple(l.vector) for l in me.corner_normals]); nfinite = bool(np.isfinite(N).all()) and bool((np.linalg.norm(N, axis=1) > .5).all())
    areas = np.array([t.area for t in me.loop_triangles]); degenerate = int((areas < 1e-12).sum())
    winf = [len(v.groups) for v in me.vertices]; wsum = [sum(g.weight for g in v.groups) for v in me.vertices]
    bad_w = int(sum(1 for n_, s_ in zip(winf, wsum) if hero and (n_ < 1 or n_ > 4 or abs(s_ - 1) > 1e-5)))
    meshes[o.name] = {'hero': hero, 'modifiers': mods, 'verts': len(me.vertices), 'tris': len(me.loop_triangles), 'finite_positions': finite,
                      'finite_unit_normals': nfinite, 'degenerate_tris': degenerate, 'bad_weight_verts': bad_w, 'max_influences': max(winf) if winf else 0}
    if hero:
        tri_total += len(me.loop_triangles)
        if mods != ['ARMATURE']: problems.append(o.name + ': modifiers ' + str(mods))
    if not finite or not nfinite or degenerate or bad_w: problems.append(o.name + ': ' + json.dumps(meshes[o.name]))
out['meshes'] = meshes; out['hero_triangles'] = tri_total
J = os.path.join(T, 'export', 'shihtzu_toy.json')
if os.path.exists(J):
    meta = json.load(open(J)); blob = open(os.path.join(T, 'export', meta['bin']), 'rb').read()
    def arr(nm):
        L = next(l for l in meta['layout'] if l['name'] == nm); dt = np.dtype('<' + L['type'])
        return np.frombuffer(blob, dt, L['count'], L['offset'])
    pos = arr('position').reshape(-1, 3); nrm = arr('normal').reshape(-1, 3).astype(float) / 32767; sw = arr('skinWeight').reshape(-1, 4); si = arr('skinIndex').reshape(-1, 4); idx = arr('index')
    tri = idx.reshape(-1, 3); Pt = pos[tri].astype(float); ar = np.linalg.norm(np.cross(Pt[:, 1] - Pt[:, 0], Pt[:, 2] - Pt[:, 0]), axis=1) / 2
    wn = np.cross(Pt[:, 1] - Pt[:, 0], Pt[:, 2] - Pt[:, 0]); wn /= np.maximum(np.linalg.norm(wn, axis=1, keepdims=True), 1e-12)
    vn = nrm[tri].mean(1); vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)
    inward = (np.sum(wn * vn, 1) < -.2) & (ar > 1e-9)
    out['export'] = {'name': meta['name'], 'height': meta['height'], 'bones': len(meta['bones']), 'verts': int(meta['vertexCount']), 'tris': int(len(tri)),
                     'finite': bool(np.isfinite(pos).all()), 'weight_sum_offenders': int((np.abs(sw.astype(int).sum(1) - 255) > 1).sum()),
                     'skin_index_in_range': bool((si < len(meta['bones'])).all()), 'index_in_range': bool((idx < len(pos)).all()),
                     'degenerate_tris': int((ar < 1e-12).sum()), 'normal_unit_ok': bool((np.abs(np.linalg.norm(nrm, axis=1) - 1) < .01).all()),
                     'inward_wound_tris': int(inward.sum()), 'min_y': round(float(pos[:, 1].min()), 4), 'max_y': round(float(pos[:, 1].max()), 4),
                     'tris_match_rig': int(len(tri)) == tri_total}
    if out['export']['degenerate_tris'] or not out['export']['finite'] or not out['export']['index_in_range'] or out['export']['weight_sum_offenders'] or out['export']['inward_wound_tris']:
        problems.append('export: ' + json.dumps(out['export']))
# ---- the lock: the approved model at rest
bpy.ops.import_scene.gltf(filepath='D:/projects/chewy-life-3d/public/models/shihtzu-toy.glb')
lock = {}
for o in bpy.data.objects:
    if o.type != 'MESH' or o.name in REST: continue
    nm = o.name.split('.')[0]
    if nm not in REST: continue
    Vg = np.array([list(o.matrix_world @ v.co) for v in o.data.vertices]); Vr = REST[nm]
    kd = KDTree(len(Vr))
    for i, p in enumerate(Vr): kd.insert(Vector(p), i)
    kd.balance(); d = np.array([kd.find(Vector(p))[2] for p in Vg])
    kd2 = KDTree(len(Vg))
    for i, p in enumerate(Vg): kd2.insert(Vector(p), i)
    kd2.balance(); d2 = np.array([kd2.find(Vector(p))[2] for p in Vr])
    lock[nm] = {'max_delta_mm': round(float(max(d.max(), d2.max())) * 1000, 4)}
out['lock_vs_approved_glb'] = lock
if any(v['max_delta_mm'] > .01 for v in lock.values()): problems.append('lock: ' + json.dumps(lock))
def load_px(path):
    im = bpy.data.images.load(path, check_existing=False); w_, h_ = im.size
    px = np.empty(w_ * h_ * 4, np.float32); im.pixels.foreach_get(px)
    return np.round(px.reshape(h_, w_, 4)[..., :3] * 255).astype(int)       # (rows bottom-up, as the atlas charts are laid out)
a = load_px(os.path.join(T, 'shihtzu-toy_atlas.png')); b = load_px(os.path.join(T, 'shihtzu-toy_rig_atlas.png'))
mask = np.ones(a.shape[:2], bool)
for (x0, y0, w, h) in [(768, 512, 512, 160), (768, 672, 512, 96), (1792, 384, 128, 128), (1920, 384, 128, 128)]:   # lidU, lidD, cavity, tongue
    mask[y0:y0 + h, x0:x0 + w] = False
diff = np.abs(a - b).max(-1)
out['atlas_lock'] = {'pixels_changed_outside_new_charts': int((diff[mask] > 0).sum())}
if out['atlas_lock']['pixels_changed_outside_new_charts']: problems.append('atlas lock: ' + json.dumps(out['atlas_lock']))
out['problems'] = problems; out['ok'] = not problems and out['bones']['contract_ok']
json.dump(out, open(os.path.join(T, 'validation.json'), 'w'), indent=1)
print('VALIDATION', json.dumps({'ok': out['ok'], 'problems': problems[:6], 'hero_triangles': tri_total, 'export': out.get('export'), 'lock': lock, 'atlas': out['atlas_lock']}))
