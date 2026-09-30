# Export a rigged Blender character to the game's baked-hero format (src/actors/heroModels.js):
#   public/rigs/<name>.json  bones [{ name, parent, pos }] in three.js space (y up, facing +z), the attribute layout
#   public/rigs/<name>.bin   position f4x3, normal i2x3 (normalized), uv f4x2, skinIndex u1x4, skinWeight u1x4, index u4
#   public/rigs/<name>.png   the colour atlas;  <name>_n.png  a flat normal map (the baked heroes' material expects one)
#
#   blender --background RIG.blend --python tools/blender/codex/hero_export.py -- --out DIR --name chewy_b
#           [--rig ARMATURE_NAME] [--height 1.2] [--no-outline eye,tongue,mouth,lid] [--scale 1]
#
# Contract (docs: .claude/skills/codex-blender/SKILL.md, "Rigging for the game"):
#  - one armature; bone names = the hero contract (HERO_BONES below); every deforming mesh has only an Armature
#    modifier left (apply everything else) and vertex groups named after bones.
#  - bones are exported as positions only (their heads, rest pose): the game rebuilds each bone as a Group with no
#    rotation, so the Animator's rotations pivot at the bone head about axes parallel to the world axes.
#  - Blender -> three.js: (x, y, z) -> (x, z, -y); character faces -Y in Blender (+Z in the game), his left is +X.
import bpy, json, os, sys, re
import numpy as np

HERO_BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'jaw',
              'eye_L', 'lidU_L', 'lidD_L', 'brow_L', 'lip_L', 'ear_L', 'earTip_L', 'upperarm_L', 'forearm_L', 'hand_L', 'thigh_L', 'shin_L', 'foot_L',
              'eye_R', 'lidU_R', 'lidD_R', 'brow_R', 'lip_R', 'ear_R', 'earTip_R', 'upperarm_R', 'forearm_R', 'hand_R', 'thigh_R', 'shin_R', 'foot_R',
              'tail1', 'tail2', 'tail3', 'tail4']
PARENT = {'root': None, 'hips': 'root', 'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck', 'jaw': 'head',
          'tail1': 'hips', 'tail2': 'tail1', 'tail3': 'tail2', 'tail4': 'tail3'}
for s in 'LR':
    PARENT.update({f'eye_{s}': 'head', f'lidU_{s}': 'head', f'lidD_{s}': 'head', f'brow_{s}': 'head', f'lip_{s}': 'head',
                   f'ear_{s}': 'head', f'earTip_{s}': f'ear_{s}', f'upperarm_{s}': 'chest', f'forearm_{s}': f'upperarm_{s}',
                   f'hand_{s}': f'forearm_{s}', f'thigh_{s}': 'hips', f'shin_{s}': f'thigh_{s}', f'foot_{s}': f'shin_{s}'})

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d=None): return argv[argv.index(k) + 1] if k in argv else d
OUT = os.path.abspath(arg('--out', '.')); NAME = arg('--name', 'hero'); SCALE = float(arg('--scale', '1'))
HEIGHT = arg('--height'); NO_OUTLINE = [s for s in (arg('--no-outline', 'eye,tongue,mouth,lid')).split(',') if s]
os.makedirs(OUT, exist_ok=True)
log = lambda *a: print('[hero_export]', *a)
warn = []

arm = bpy.data.objects.get(arg('--rig', '')) if arg('--rig') else next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
if not arm: raise SystemExit('hero_export: no armature in the file')
arm.data.pose_position = 'REST'
bpy.context.view_layer.update()
M = arm.matrix_world
def to_three(P): P = np.asarray(P, np.float64); return np.stack([P[..., 0], P[..., 2], -P[..., 1]], -1) * SCALE

# ---------------------------------------------------------------- bones (contract order)
missing = [b for b in HERO_BONES if b not in arm.data.bones]
if missing: raise SystemExit('hero_export: armature is missing contract bones: ' + ', '.join(missing))
extra = [b.name for b in arm.data.bones if b.name not in HERO_BONES]
if extra: warn.append('extra bones ignored (their weights go to the nearest contract parent): ' + ', '.join(extra))
for b in HERO_BONES:
    p = arm.data.bones[b].parent
    if (p.name if p else None) != PARENT[b] and b != 'root':
        warn.append(f'bone {b}: parent is {p.name if p else None}, contract says {PARENT[b]} (exported with the contract parent)')
bidx = {b: i for i, b in enumerate(HERO_BONES)}
heads = {b: np.array(M @ arm.data.bones[b].head_local) for b in HERO_BONES}
def contract_bone(name):  # extra bones fold into their nearest contract ancestor
    b = arm.data.bones.get(name)
    while b is not None and b.name not in bidx: b = b.parent
    return b.name if b is not None else None

# ---------------------------------------------------------------- meshes
def deforming(o):
    return o.type == 'MESH' and any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers)
meshes = [o for o in bpy.data.objects if deforming(o) and not o.hide_render]
if not meshes: raise SystemExit('hero_export: no meshes with an Armature modifier on ' + arm.name)
POS, NRM, UV, SI, SW, IDX = [], [], [], [], [], []
base = outline_count = 0; atlas = None
no_ol = lambda n: any(re.search(k, n, re.I) for k in NO_OUTLINE)
for o in sorted(meshes, key=lambda o: (no_ol(o.name), o.name)):
    others = [m.type for m in o.modifiers if m.type != 'ARMATURE' and m.show_render]
    if others: warn.append(f'{o.name}: modifiers {others} are ignored (apply them before export)')
    me = o.data
    me.calc_loop_triangles()
    W = o.matrix_world
    V = np.empty(len(me.vertices) * 3, np.float64); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
    V = (np.c_[V, np.ones(len(V))] @ np.array(W).T)[:, :3]
    nl = len(me.loops)
    CN = np.empty(nl * 3, np.float64); me.corner_normals.foreach_get('vector', CN); CN = CN.reshape(-1, 3)
    CN = CN @ np.array(W.to_3x3().inverted().transposed()).T
    lv = np.empty(nl, np.int64); me.loops.foreach_get('vertex_index', lv)
    if not me.uv_layers.active: raise SystemExit(f'hero_export: {o.name} has no UV map')
    uv = np.empty(nl * 2, np.float64); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    tl = np.empty(len(me.loop_triangles) * 3, np.int64); me.loop_triangles.foreach_get('loops', tl)
    # one game vertex per (vertex, uv, normal) corner
    key = np.c_[lv[:, None].astype(np.float64), np.round(uv * 1e6), np.round(CN * 1e3)]
    uniq, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.ravel(); vi = lv[first]
    # weights: top 4 contract bones per vertex
    names = [contract_bone(g.name) if g.name in arm.data.bones else None for g in o.vertex_groups]
    w = np.zeros((len(me.vertices), len(HERO_BONES)), np.float64)
    for v in me.vertices:
        for g in v.groups:
            b = names[g.group] if g.group < len(names) else None
            if b and g.weight > 0: w[v.index, bidx[b]] += g.weight
    unweighted = int((w.sum(1) <= 1e-6).sum())
    if unweighted: warn.append(f'{o.name}: {unweighted} vertices have no bone weights (bound to head)'); w[w.sum(1) <= 1e-6, bidx['head']] = 1
    w = w[vi]; top = np.argsort(-w, 1)[:, :4]; w4 = np.take_along_axis(w, top, 1); w4 /= np.maximum(w4.sum(1, keepdims=True), 1e-9)
    # material atlas (one shared image expected)
    for s in o.material_slots:
        if s.material and s.material.use_nodes:
            for n in s.material.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    if atlas and n.image != atlas: warn.append(f'{o.name}: uses a second image {n.image.name} (only {atlas.name} is exported)')
                    atlas = atlas or n.image
    POS.append(to_three(V[vi])); NRM.append(to_three(CN[first]) / max(SCALE, 1e-9)); UV.append(uv[first])
    SI.append(top.astype(np.uint8)); SW.append(w4)
    IDX.append(inv[tl] + base); base += len(vi)
    if not no_ol(o.name): outline_count += len(tl)
    log(f'{o.name}: {len(vi)} verts, {len(tl) // 3} tris{" (no outline)" if no_ol(o.name) else ""}')

pos = np.concatenate(POS).astype('<f4')
n = np.concatenate(NRM); n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
if not np.isfinite(n).all() or not np.isfinite(pos).all(): raise SystemExit('hero_export: NaN in positions / normals')
nrm = (n * 32767).round().astype('<i2')
uvs = np.concatenate(UV).astype('<f4')
si = np.concatenate(SI).astype('<u1'); sw = (np.concatenate(SW) * 255).round().astype('<u1')
idx = np.concatenate(IDX).astype('<u4')
layout, blob, off = [], bytearray(), 0
for nm, a, size, normd in (('position', pos, 3, False), ('normal', nrm, 3, True), ('uv', uvs, 2, False),
                           ('skinIndex', si, 4, False), ('skinWeight', sw, 4, True), ('index', idx, 1, False)):
    b = a.tobytes(); layout.append({'name': nm, 'type': a.dtype.str[1:], 'itemSize': size, 'normalized': normd, 'offset': off, 'count': int(a.size)})
    blob += b; off += len(b)
    while off % 4: blob += b'\0'; off += 1
open(os.path.join(OUT, NAME + '.bin'), 'wb').write(blob)

# ---------------------------------------------------------------- textures
if not atlas: raise SystemExit('hero_export: no image texture found on the meshes')
tex = os.path.join(OUT, NAME + '.png')
img = atlas.copy(); img.filepath_raw = tex; img.file_format = 'PNG'
if atlas.packed_file or not os.path.exists(bpy.path.abspath(atlas.filepath)): img.save()
else: img.save()
flat = bpy.data.images.new(NAME + '_n', 4, 4); flat.colorspace_settings.name = 'Non-Color'
flat.pixels.foreach_set(np.tile([0.5, 0.5, 1.0, 1.0], 16).astype(np.float32)); flat.filepath_raw = os.path.join(OUT, NAME + '_n.png'); flat.file_format = 'PNG'; flat.save()

height = float(HEIGHT) if HEIGHT else float(pos[:, 1].max())
bones = [{'name': b, 'parent': PARENT[b], 'pos': to_three(heads[b]).round(5).tolist()} for b in HERO_BONES]
meta = {'name': NAME, 'scale': SCALE, 'height': round(height, 3), 'bones': bones, 'layout': layout,
        'vertexCount': int(base), 'outlineIndexCount': int(outline_count), 'bin': NAME + '.bin', 'tex': NAME + '.png', 'normalTex': NAME + '_n.png'}
json.dump(meta, open(os.path.join(OUT, NAME + '.json'), 'w'), indent=1)
for w_ in warn: log('WARNING', w_)
log(f'wrote {NAME}: {base} verts, {len(idx) // 3} tris, {len(blob) / 1e6:.2f} MB -> {OUT}')
print('HERO_EXPORT', json.dumps({'name': NAME, 'verts': int(base), 'tris': int(len(idx) // 3), 'warnings': warn}))
