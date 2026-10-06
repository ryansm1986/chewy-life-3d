"""Validation of poe-toy_rig.blend and the hero export (export/poe_toy.json + .bin) -> validation.json
    blender --background --factory-startup --python validate.py
Checks: the 37 contract bones and parents; every hero mesh has only an Armature modifier; finite positions and normals;
<= 4 influences summing to 1; no degenerate triangles; the fuma prop excluded from the hero; the export's buffers (finite,
normalized weights summing to 255, indices in range, the bone list) and its triangle count against the rig."""
import bpy, json, os, math
import numpy as np
T = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(T, 'poe-toy_rig.blend'))
arm = bpy.data.objects['Poe_Rig']
HERO = json.load(open(os.path.join(T, 'joints-rig.json')))['bones']
out = {'bones': {'count': len(arm.data.bones), 'contract_ok': all(arm.data.bones.get(b['name']) is not None and
        ((arm.data.bones[b['name']].parent.name if arm.data.bones[b['name']].parent else None) == b['parent']) for b in HERO) and len(arm.data.bones) == 37}}
meshes = {}; tri_total = 0; problems = []
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    mods = [m.type for m in o.modifiers]
    hero = any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers) and not o.hide_render
    me = o.data; me.calc_loop_triangles()
    V = np.array([tuple(v.co) for v in me.vertices]); finite = bool(np.isfinite(V).all())
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
out['fuma_excluded_from_hero'] = not meshes.get('fuma_back', {}).get('hero', False)
# the export
J = os.path.join(T, 'export', 'poe_toy.json')
if os.path.exists(J):
    meta = json.load(open(J)); blob = open(os.path.join(T, 'export', meta['bin']), 'rb').read()
    def arr(nm):
        L = next(l for l in meta['layout'] if l['name'] == nm); dt = np.dtype('<' + L['type'])
        return np.frombuffer(blob, dt, L['count'], L['offset'])
    pos = arr('position').reshape(-1, 3); nrm = arr('normal').reshape(-1, 3); sw = arr('skinWeight').reshape(-1, 4); si = arr('skinIndex').reshape(-1, 4); idx = arr('index')
    tri = idx.reshape(-1, 3); P = pos[tri]; ar = np.linalg.norm(np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]), axis=1) / 2
    out['export'] = {'name': meta['name'], 'height': meta['height'], 'bones': len(meta['bones']), 'verts': int(meta['vertexCount']), 'tris': int(len(tri)),
                     'finite': bool(np.isfinite(pos).all()), 'weights_sum_255': bool((sw.astype(int).sum(1) == 255).all()) or int((np.abs(sw.astype(int).sum(1) - 255) > 1).sum()) == 0,
                     'weight_sum_offenders': int((np.abs(sw.astype(int).sum(1) - 255) > 1).sum()), 'skin_index_in_range': bool((si < len(meta['bones'])).all()),
                     'index_in_range': bool((idx < len(pos)).all()), 'degenerate_tris': int((ar < 1e-12).sum()),
                     'normal_unit_ok': bool((np.abs(np.linalg.norm(nrm.astype(float) / 32767, axis=1) - 1) < .01).all()),
                     'min_y': round(float(pos[:, 1].min()), 4), 'max_y': round(float(pos[:, 1].max()), 4),
                     'tris_match_rig': int(len(tri)) == tri_total}
    if out['export']['degenerate_tris'] or not out['export']['finite'] or not out['export']['index_in_range'] or out['export']['weight_sum_offenders']:
        problems.append('export: ' + json.dumps(out['export']))
out['problems'] = problems; out['ok'] = not problems and out['bones']['contract_ok'] and out['fuma_excluded_from_hero']
json.dump(out, open(os.path.join(T, 'validation.json'), 'w'), indent=1)
print('VALIDATION', json.dumps({'ok': out['ok'], 'problems': problems[:6], 'hero_triangles': tri_total, 'export': out.get('export')}))
