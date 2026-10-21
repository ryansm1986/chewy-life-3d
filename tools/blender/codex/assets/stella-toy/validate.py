"""Validation of stella-toy_rig.blend and the hero export (export/stella_toy.json + .bin) -> validation.json
    blender --background --factory-startup --python validate.py
Checks: the 37 contract bones and parents; every hero mesh has only an Armature modifier; finite positions and normals;
<= 4 influences summing to 1; no degenerate triangles; the export's buffers (finite, weights summing to 255, indices in range)
and its triangle count against the rig; outward winding; the lock: every approved mesh at rest matches
public/models/stella-toy.glb (vertex distance) the model's atlas is the rig's outside the lid / cavity / tongue charts, and against round 4 (approved-r4/) only the costume's
charts change (phase 3, the Sun Oracle recolour) while the shapes and UVs stay the same."""
import bpy, json, os, math
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
T = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(T, 'stella-toy_rig.blend'))
arm = bpy.data.objects['Stella_Rig']
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
J = os.path.join(T, 'export', 'stella_toy.json')
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
bpy.ops.import_scene.gltf(filepath='D:/projects/chewy-life-3d/public/models/stella-toy.glb')
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
    return np.round(px.reshape(h_, w_, 4)[..., :3] * 255).astype(int)
a = load_px(os.path.join(T, 'stella-toy_atlas.png')); b = load_px(os.path.join(T, 'stella-toy_rig_atlas.png'))
mask = np.ones(a.shape[:2], bool)
for (x0, y0, w, h) in [(1024, 0, 512, 192), (1024, 192, 512, 128), (1536, 0, 128, 128), (1664, 0, 128, 128)]:   # lidU, lidD, cavity, tongue
    mask[y0:y0 + h, x0:x0 + w] = False
diff = np.abs(a - b).max(-1)
# lock A: the rig's atlas is the model's (public/models/stella-toy.glb's) outside the rig's own charts (lids, cavity, tongue)
out['atlas_lock'] = {'rig_vs_model_pixels_changed_outside_rig_charts': int((diff[mask] > 0).sum())}
# lock B (phase 3, the Sun Oracle recolour): against the round-4 rig atlas with the nose fix (approved-r4/), only the costume's
# charts and ramp rows may change; the fur, face, eyes, nose, inner ears, lids, cavity and tongue stay pixel-identical
REF = os.path.join(T, 'approved-r4', 'stella-toy_rig_atlas_nosefix.png')
if os.path.exists(REF):
    r_ = load_px(REF); dB = np.abs(r_ - b).max(-1); cost = np.zeros(b.shape[:2], bool)
    for (x0, y0, w, h) in [(0, 0, 1024, 512), (0, 512, 1024, 256), (1024, 320, 512, 320), (1536, 320, 512, 320),     # robe, skirt, sleeves
                           (1792, 896, 256, 256), (1280, 640, 256, 256), (1536, 640, 256, 256)]:                   # perimix, pinkmix, glassmix
        cost[y0:y0 + h, x0:x0 + w] = True
    for k in (2, 3, 4, 5, 10, 12): cost[1152 + 32 * k:1152 + 32 * (k + 1), 1280:2048] = True   # the ramp rows: peri, pink, pearl, glass, sheer, petti
    # the mid-blink fix (2026-10-17) reshaped the upper lid shells, and their paint is projected from the closed lid's geometry:
    # the lidU chart is repainted (the colours are the same face colours, the lash where the new edge lies)
    cost[0:192, 1024:1536] = True
    out['atlas_lock']['vs_round4_pixels_changed_outside_costume'] = int((dB[~cost] > 0).sum())
    out['atlas_lock']['vs_round4_costume_pixels_changed'] = int((dB[cost] > 0).sum())
if any(v for k, v in out['atlas_lock'].items() if 'outside' in k): problems.append('atlas lock: ' + json.dumps(out['atlas_lock']))
# the model lock: the new public GLB keeps round 4's shapes and UVs (approved-r4/stella-toy.glb), object by object
OLD = os.path.join(T, 'approved-r4', 'stella-toy.glb')
if os.path.exists(OLD):
    def glb_meshes(path):
        before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path); res = {}
        for o in set(bpy.data.objects) - before:
            if o.type != 'MESH': continue
            me = o.data; P_ = np.array([list(o.matrix_world @ v.co) for v in me.vertices])
            uv = np.zeros(len(me.loops) * 2); me.uv_layers[0].data.foreach_get('uv', uv) if me.uv_layers else None
            res[o.name.split('.')[0]] = (P_, uv.reshape(-1, 2))
        for o in set(bpy.data.objects) - before: bpy.data.objects.remove(o, do_unlink=True)
        return res
    A_ = glb_meshes(OLD); B_ = glb_meshes('D:/projects/chewy-life-3d/public/models/stella-toy.glb'); ml = {}
    for nm in sorted(set(A_) | set(B_)):
        if nm not in A_ or nm not in B_: ml[nm] = 'missing'; continue
        (Pa, Ua), (Pb, Ub) = A_[nm], B_[nm]
        ml[nm] = {'same_counts': Pa.shape == Pb.shape and Ua.shape == Ub.shape,
                  'max_pos_mm': round(float(np.abs(Pa - Pb).max()) * 1000, 4) if Pa.shape == Pb.shape else None,
                  'max_uv': round(float(np.abs(Ua - Ub).max()), 6) if Ua.shape == Ub.shape else None}
    out['model_vs_round4'] = ml
    if any(v == 'missing' or not v['same_counts'] or v['max_pos_mm'] > .001 or v['max_uv'] > 1e-6 for v in ml.values()): problems.append('model vs round 4: ' + json.dumps(ml)[:400])
out['problems'] = problems; out['ok'] = not problems and out['bones']['contract_ok']
json.dump(out, open(os.path.join(T, 'validation.json'), 'w'), indent=1)
print('VALIDATION', json.dumps({'ok': out['ok'], 'problems': problems[:6], 'hero_triangles': tri_total, 'export': out.get('export'), 'lock': lock, 'atlas': out['atlas_lock'],
                                'model_vs_round4': {k: v for k, v in list(out.get('model_vs_round4', {}).items())}}))
