# Step 2 of the refine pipeline (see README.md): turn a procedural rig dump into a Blender-refined skin.
#   blender -b --factory-startup -P tools/blender/refine_rig.py -- tools/blender/work/chewy.json public/rigs [tex=1024] [tris=14000]
#
# Per fusion group (head+ears+hat, body+tail+scarf, each arm with its hand, each leg with its foot):
#   voxel-remesh the union of the group's primitive parts -> one watertight surface
#   concave-only relaxation -> soft fillets where parts met (ear roots, cuffs, ankles, toe beans), convex shape kept
#   decimate to the triangle budget, smart-UV into one shared atlas
#   Cycles bake of the original painted colours (+ blush / mouth lines) onto the atlas, then an AO bake of the whole
#   character tinted lavender and multiplied in
#   smooth skin weights from proximity to each bone's original parts (blends only across the fused seams)
# Parts without an ink hull (eyes, nose, mouth, brows) pass through unchanged at game tessellation.
# Output: <out>/<name>.json (layout + bone map), <name>.bin (vertex data), <name>.png (colour x AO atlas).
import bpy, bmesh, json, sys, os, time, math
import numpy as np
from mathutils.bvhtree import BVHTree
from bpy_extras.mesh_utils import mesh_linked_triangles, mesh_linked_uv_islands

T0 = time.time()
def log(*a): print(f'[refine {time.time() - T0:6.1f}s]', *a, flush=True)

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = os.path.abspath(argv[0]), os.path.abspath(argv[1])
opt = dict(a.split('=', 1) for a in argv[2:])
TEX = int(opt.get('tex', 1024))
VOXEL = float(opt.get('voxel', 0.0035))
FILLET = int(opt.get('fillet', 16))
TRIS = int(opt.get('tris', 0))  # 0: 70% of the procedural shells' triangle count
AO_DIST = float(opt.get('ao', 0.14))
AO_STR = float(opt.get('aostr', 0.55))
UVMODE = opt.get('uv', 'relax')
HEAD_TEXELS = float(opt.get('headscale', 1.5))  # texel-area multiplier for the whole head group
FACE_TEXELS = float(opt.get('face', 4.0))       # ... and for the face island (portraits, dialogue, close zoom)
FACE_Z = float(opt.get('facez', 0.42))          # face region: cos of the angle from the head's forward axis
UV_ANGLE = float(opt.get('uvangle', 85))       # smart-project chart angle before the relax pass (fewer, bigger charts)
EDGE_SIGMA = float(opt.get('edges', 2.5))       # blur radius (texels) of the stair-step cleanup; 0 = off
EDGE_FLAT = float(opt.get('edgeflat', 0.06))      # texel-to-neighbour colour step below which a texel counts as flat
EDGE_MARGIN = float(opt.get('edgemargin', 0.03))  # how much better a neighbour colour must fit to replace a texel's own
UV_MARGIN = float(opt.get('uvmargin', 0.0025))  # 2.5 px at 1024; islands are dilated 12 px after the bake
KEEP_BLEND = opt.get('blend')

D = json.load(open(SRC))
NAME = os.path.splitext(os.path.basename(SRC))[0]
bones = D['bones']
if not TRIS: TRIS = int(D.get('shellTris', 20000) * 0.7)
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection

# ------------------------------------------------------------------ helpers
def mesh_obj(name, P, F, col=None):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(P)); me.vertices.foreach_set('co', np.ascontiguousarray(P, np.float32).ravel())
    me.loops.add(F.size); me.loops.foreach_set('vertex_index', np.ascontiguousarray(F, np.int32).ravel())
    me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', (np.arange(len(F), dtype=np.int32) * F.shape[1]))
    me.update(calc_edges=True)
    if col is not None:  # per corner (the soups are unwelded, so corner == vertex)
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        c = np.ones((F.size, 4), np.float32); c[:, :3] = col[F.ravel()]
        ca.data.foreach_set('color', c.ravel())
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    return ob

def soup(parts):
    P, F, C, off = [], [], [], 0
    for p in parts:
        pos = np.array(p['pos'], np.float32).reshape(-1, 3)
        idx = np.array(p['idx'], np.int32).reshape(-1, 3) if p.get('idx') else np.arange(len(pos), dtype=np.int32).reshape(-1, 3)
        col = np.array(p['col'], np.float32).reshape(-1, 3) if p.get('col') else np.ones_like(pos)
        P.append(pos); F.append(idx + off); C.append(col); off += len(pos)
    return np.concatenate(P), np.concatenate(F), np.concatenate(C)

def arrays(me):
    V = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', V)
    return V.reshape(-1, 3)

def triangulate(me):
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()

def tris(me):
    F = np.empty(len(me.polygons) * 3, np.int32); me.polygons.foreach_get('vertices', F)
    return F.reshape(-1, 3)

def evaluated_copy(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old = ob.data; ob.data = me; bpy.data.meshes.remove(old)
    return me

def area(me):
    V, F = arrays(me), tris(me)
    return 0.5 * np.linalg.norm(np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]), axis=1).sum()

def fillet(me, iters, k=0.5):
    """Concave-only Laplacian relaxation: vertices in creases move toward their neighbours (outward), convex vertices
    stay, so junctions get soft fillets while silhouettes and bumps keep their shape."""
    V, F = arrays(me), tris(me)
    E = np.empty(len(me.edges) * 2, np.int32); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
    n = len(V); deg = np.maximum(np.bincount(E.ravel(), minlength=n), 1).astype(np.float32)[:, None]
    for _ in range(iters):
        fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
        vn = np.zeros_like(V)
        for j in range(3): np.add.at(vn, F[:, j], fn)
        vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)
        avg = np.zeros_like(V); np.add.at(avg, E[:, 0], V[E[:, 1]]); np.add.at(avg, E[:, 1], V[E[:, 0]]); avg /= deg
        d = avg - V
        m = (d * vn).sum(1) > 0
        V[m] += k * d[m]
    me.vertices.foreach_set('co', V.ravel()); me.update()

def emission_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
    e = nt.nodes.new('ShaderNodeEmission'); o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(a.outputs['Color'], e.inputs['Color']); nt.links.new(e.outputs[0], o.inputs['Surface'])
    return m

def image_mat(name, img):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; nt.nodes.active = t
    return m

def new_img(name):
    img = bpy.data.images.new(name, TEX, TEX, alpha=True, float_buffer=True)
    img.generated_color = (0, 0, 0, 0)
    return img

def px(img):
    a = np.empty(TEX * TEX * 4, np.float32); img.pixels.foreach_get(a)
    return a.reshape(TEX, TEX, 4)

def raster(me, vals, out):
    """Write vals[triangle] into out at the texels whose centres fall inside each UV triangle (what a margin-0 bake
    writes)."""
    uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers['UV'].data.foreach_get('uv', uv)
    for t, v in zip(uv.reshape(-1, 3, 2) * TEX - 0.5, vals):
        lo = np.maximum(np.floor(t.min(0)).astype(int), 0); hi = np.minimum(np.ceil(t.max(0)).astype(int), TEX - 1)
        if (hi < lo).any(): continue
        xs, ys = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
        (ax, ay), (bx, by), (cx, cy) = t
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12: continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
        inside = (l1 >= -1e-4) & (l2 >= -1e-4) & (1 - l1 - l2 >= -1e-4)
        out[ys[inside], xs[inside]] = v
    return out

def uv_mask(me):
    return raster(me, np.ones(len(me.polygons), bool), np.zeros((TEX, TEX), bool))

def select_only(objs, active):
    for o in scene.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active

# ------------------------------------------------------------------ fusion groups
ROOTS = {'body', 'head', 'armL', 'armR', 'legL', 'legR', 'legFL', 'legFR', 'legBL', 'legBR'}
def group_of(bi):
    b = bi
    while b >= 0:
        if bones[b]['name'] in ROOTS: return b
        b = bones[b]['parent']
    return 0

shells = [p for p in D['parts'] if p['outline']]
groups = {}
for p in shells: groups.setdefault(group_of(p['bone']), []).append(p)
head_g = next((g for g in groups if bones[g]['name'] == 'head'), None)
log(NAME, 'groups:', {bones[g]['name']: [p['name'] for p in ps] for g, ps in groups.items()})

# ------------------------------------------------------------------ 1. fuse + fillet + decimate per group
targets, sources, areas = {}, {}, {}
emit = emission_mat('emit')
for g, parts in groups.items():
    P, F, C = soup(parts)
    src = mesh_obj(f'src_{g}', P, F, C); src.data.materials.append(emit)
    extra = [p for p in D['parts'] if not p['outline'] and p['name'] == 'faceDetails' and group_of(p['bone']) == g]
    srcs = [src]
    if extra:
        P2, F2, C2 = soup(extra); d = mesh_obj(f'srcdet_{g}', P2, F2, C2); d.data.materials.append(emit); srcs.append(d)
    sources[g] = srcs
    tgt = mesh_obj(f'fuse_{g}', P, F)
    rm = tgt.modifiers.new('rm', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = VOXEL; rm.adaptivity = 0; rm.use_smooth_shade = True
    me = evaluated_copy(tgt)
    triangulate(me)
    fillet(me, FILLET)
    areas[g] = area(me)
    targets[g] = tgt
    log(f'  {bones[g]["name"]}: {len(F)} src tris -> voxel {len(me.polygons)} tris, area {areas[g]:.4f}')

tot = sum(areas.values())
for g, tgt in targets.items():
    want = max(400, int(TRIS * areas[g] / tot))
    dec = tgt.modifiers.new('dec', 'DECIMATE'); dec.decimate_type = 'COLLAPSE'; dec.ratio = min(1, want / len(tgt.data.polygons)); dec.use_collapse_triangulate = True
    me = evaluated_copy(tgt); triangulate(me)
    # drop remesh crumbs (a few triangles cut off a thin tip): each would cost its own UV island
    crumbs = [t.polygon_index for c in mesh_linked_triangles(me) if len(c) < 16 for t in c]
    if crumbs:
        bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.faces[i] for i in crumbs], context='FACES'); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    log(f'  {bones[g]["name"]}: decimated to {len(me.polygons)} tris' + (f' ({len(crumbs)} crumb tris dropped)' if crumbs else ''))

# ------------------------------------------------------------------ 2. one UV atlas for all groups
# 'relax' (default): smart-project charts, then the face becomes ONE seamless island (seams only around it), every
# chart is re-unwrapped with minimum stretch, texel density is equalised, the head and above all the face are scaled
# up, and everything is packed tightly. 'smart': the first version (plain smart projection, head x HEAD_TEXELS).
tl = list(targets.values())
for t in tl: t.data.uv_layers.new(name='UV')

def edit_all(fn):
    select_only(tl, tl[0])
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.select_all(action='SELECT')
    fn()
    bpy.ops.object.mode_set(mode='OBJECT')

def poly_centers(me):
    c = np.empty(len(me.polygons) * 3, np.float32); me.polygons.foreach_get('center', c)
    return c.reshape(-1, 3)

def face_region(tgt):
    """Polygons of the head group that form the face: the skull's own surface (not ears or fillets into them)
    within ~65 degrees of the head's forward axis, from the chin up to the brow."""
    M = np.array(bones[head_g]['world'], np.float64).reshape(4, 4).T  # three.js matrices are column-major
    ctr, ax = M[:3, 3], M[:3, :3] / np.linalg.norm(M[:3, :3], axis=0)
    pc = poly_centers(tgt.data)
    d = (pc - ctr) @ ax; d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)  # x right, y up, z forward
    P, F, _ = soup([p for p in groups[head_g] if p['bone'] == head_g])
    tree = BVHTree.FromPolygons(P.tolist(), F.tolist())
    skull = np.array([tree.find_nearest(c)[3] < 0.006 for c in pc.tolist()])
    return (d[:, 2] > FACE_Z) & (d[:, 1] < 0.62) & (d[:, 1] > -0.92) & skull

def seam_face(tgt, face):
    bm = bmesh.new(); bm.from_mesh(tgt.data)
    for e in bm.edges:
        lf = [bool(face[f.index]) for f in e.link_faces]
        if len(lf) == 2 and lf[0] != lf[1]: e.seam = True   # the face's outline
        elif lf and all(lf): e.seam = False                 # nothing cuts across the face
    bm.to_mesh(tgt.data); bm.free()

def uv_arrays(me):
    uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers['UV'].data.foreach_get('uv', uv)
    return uv.reshape(-1, 2)

def scale_uv(tgt, k, polys=None):
    me = tgt.data; uv = uv_arrays(me)
    sel = np.ones(len(uv), bool) if polys is None else np.repeat(polys, 3)  # triangles: loops 3i..3i+2
    c = uv[sel].mean(0); uv[sel] = c + (uv[sel] - c) * k
    me.uv_layers['UV'].data.foreach_set('uv', uv.ravel())

def density(tgt, polys=None):
    """texels per metre (sqrt of UV texel area over surface area)"""
    me = tgt.data; V, F = arrays(me), tris(me); T = uv_arrays(me).reshape(-1, 3, 2) * TEX
    a3 = 0.5 * np.linalg.norm(np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]), axis=1)
    e1, e2 = T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]; au = 0.5 * np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0])
    if polys is not None: a3, au = a3[polys], au[polys]
    return math.sqrt(au.sum() / max(a3.sum(), 1e-12))

face = None
edit_all(lambda: bpy.ops.uv.smart_project(angle_limit=math.radians(UV_ANGLE if UVMODE == 'relax' else 58), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False))
if UVMODE == 'relax':
    edit_all(lambda: bpy.ops.uv.seams_from_islands(mark_seams=True, mark_sharp=False))
    if head_g is not None:
        face = face_region(targets[head_g]); seam_face(targets[head_g], face)
    def unwrap():
        try: bpy.ops.uv.unwrap(method='MINIMUM_STRETCH', fill_holes=True, correct_aspect=True, margin=0.0)
        except TypeError: bpy.ops.uv.unwrap(method='ANGLE_BASED', fill_holes=True, correct_aspect=True, margin=0.0)
    edit_all(unwrap)
    edit_all(lambda: bpy.ops.uv.average_islands_scale())
if head_g is not None:
    scale_uv(targets[head_g], math.sqrt(HEAD_TEXELS))
    if face is not None and face.any(): scale_uv(targets[head_g], math.sqrt(FACE_TEXELS / HEAD_TEXELS), face)
edit_all(lambda: bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=UV_MARGIN, scale=True))
if head_g is not None and face is not None:
    log(f'  face: {int(face.sum())} tris, {density(targets[head_g], face):.0f} texels/m')
for g, t in targets.items():
    log(f'  {bones[g]["name"]}: {density(t):.0f} texels/m, {len(mesh_linked_uv_islands(t.data))} islands')
log('uv atlas packed')

# ------------------------------------------------------------------ 3. bakes
scene.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    scene.cycles.device = 'GPU'
except Exception as e:
    log('GPU unavailable, baking on CPU', e)
scene.world = bpy.data.worlds.new('w'); scene.world.light_settings.distance = AO_DIST
bk = scene.render.bake; bk.margin = 0; bk.use_clear = True

col_imgs, ao_imgs = {}, {}
for g, tgt in targets.items():
    ci, ai = new_img(f'col_{g}'), new_img(f'ao_{g}')
    col_imgs[g], ao_imgs[g] = ci, ai
    tgt.data.materials.clear(); tgt.data.materials.append(image_mat(f'tm_{g}', ci))

# colour: selected (original parts) -> active (fused surface), rays from a cage just outside it
scene.cycles.samples = int(opt.get('colsamples', 64))  # boundary texels average many sub-texel rays (4 left speckled edges)
bk.use_selected_to_active = True; bk.cage_extrusion = 0.012; bk.max_ray_distance = 0.04
for g, tgt in targets.items():
    for o in scene.objects: o.hide_render = False
    select_only(sources[g], tgt)
    tgt.select_set(True)
    bpy.ops.object.bake(type='EMIT')
    log(f'  colour baked: {bones[g]["name"]}')

# AO: the fused surfaces plus the pass-through parts as occluders, originals hidden
det = [p for p in D['details'] if not p.get('mouth')]
if det:
    P, F, C = soup(det); occ = mesh_obj('occ_details', P, F, C)
for srcs in sources.values():
    for s in srcs: s.hide_render = True
scene.cycles.samples = 256
bk.use_selected_to_active = False
for g, tgt in targets.items():
    tgt.data.materials[0].node_tree.nodes.active.image = ao_imgs[g]
    select_only([tgt], tgt)
    bpy.ops.object.bake(type='AO')
    log(f'  ao baked: {bones[g]["name"]}')

def shifted(a, dy, dx, fill=0):  # a[y - dy, x - dx], out-of-range filled (np.roll would wrap islands across the atlas)
    o = np.full_like(a, fill); H, W = a.shape[:2]
    o[max(dy, 0):H + min(dy, 0), max(dx, 0):W + min(dx, 0)] = a[max(-dy, 0):H + min(-dy, 0), max(-dx, 0):W + min(-dx, 0)]
    return o

def clean_edges(rgb, ids, sigma):
    """Straighten the stair-steps that per-vertex colour masks leave along colour boundaries. Blur each UV island on
    its own (normalised, so neighbouring islands never bleed in), then give every texel the flat colour nearby that
    best explains the blurred value: along a hard edge the boundary slides onto the smooth mid-contour of the blur.
    Only flat texels (inside a colour region) are offered as colours, so the bake's anti-aliased greys along the old
    edge never spread; a flat texel keeps its own colour unless a neighbour fits clearly better, so gradients stay."""
    enc = lambda c: np.power(np.clip(c, 0, None), 1 / 2.2)  # compare colours perceptually, not in linear light
    e = enc(rgb)
    grad = np.zeros(ids.shape, np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        same = shifted(ids, dy, dx, -2) == ids
        grad = np.maximum(grad, np.where(same, np.linalg.norm(shifted(e, dy, dx) - e, axis=-1), 0))
    flat = (grad < EDGE_FLAT) & (ids >= 0)
    r = int(math.ceil(2.5 * sigma)); acc = np.zeros_like(rgb); wsum = np.zeros(ids.shape, np.float32)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            w = math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
            if w < 0.02: continue
            same = (shifted(ids, dy, dx, -2) == ids) * np.float32(w)
            acc += shifted(rgb, dy, dx) * same[..., None]; wsum += same
    blur = enc(acc / np.maximum(wsum, 1e-6)[..., None])
    best = rgb.copy(); bestd = np.where(flat, np.linalg.norm(e - blur, axis=-1) - EDGE_MARGIN, np.inf)
    for rr in (1, 2, 3, 4, 5):
        for k in range(8 if rr > 1 else 4):
            a = k * math.pi / (4 if rr > 1 else 2)
            dy, dx = int(round(rr * math.sin(a))), int(round(rr * math.cos(a)))
            c = shifted(rgb, dy, dx); ok = (shifted(ids, dy, dx, -2) == ids) & shifted(flat, dy, dx, False)
            d = np.where(ok, np.linalg.norm(enc(c) - blur, axis=-1), np.inf)
            m = d < bestd; best[m] = c[m]; bestd[m] = d[m]
    out = np.where(((ids >= 0) & np.isfinite(bestd))[..., None], best, rgb)  # an edge texel with no flat colour in reach keeps its own
    log(f'  edges: {np.mean(np.any(out != rgb, axis=-1)[ids >= 0]):.1%} of texels moved onto smooth boundaries')
    return out

# composite colour x tinted AO, dilate islands, sRGB-encode, save
col = np.zeros((TEX, TEX, 4), np.float32); ao = np.ones((TEX, TEX), np.float32)
covered = np.zeros((TEX, TEX), bool)
ids, nid = np.full((TEX, TEX), -1, np.int32), 0
for g, tgt in targets.items():
    m = uv_mask(tgt.data); covered |= m
    col[m] = px(col_imgs[g])[m]; ao[m] = px(ao_imgs[g])[m][:, 0]
    pid = np.zeros(len(tgt.data.polygons), np.int32)
    for isl in mesh_linked_uv_islands(tgt.data): pid[isl] = nid; nid += 1
    raster(tgt.data, pid, ids)
if EDGE_SIGMA > 0: col[..., :3] = clean_edges(col[..., :3], ids, EDGE_SIGMA)
tint = np.array([0.42, 0.36, 0.62], np.float32)  # lavender shadow, like the toon shader's shade colour
shade = tint + (1 - tint) * ao[..., None]
rgb = col[..., :3] * (1 - AO_STR + AO_STR * shade)
filled = covered.copy()
for _ in range(12):  # grow island borders so mip levels / bilinear taps never pull in the empty background
    acc = np.zeros_like(rgb); cnt = np.zeros((TEX, TEX), np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        sh = shifted(filled, dy, dx); acc += shifted(rgb, dy, dx) * sh[..., None]; cnt += sh
    grow = (~filled) & (cnt > 0)
    rgb[grow] = acc[grow] / cnt[grow][:, None]; filled |= grow
rgb[~filled] = 1
srgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(np.clip(rgb, 0, None), 1 / 2.4) - 0.055)
out = bpy.data.images.new('atlas', TEX, TEX, alpha=True)
out.colorspace_settings.name = 'Non-Color'
o4 = np.ones((TEX, TEX, 4), np.float32); o4[..., :3] = np.clip(srgb, 0, 1)
out.pixels.foreach_set(o4.ravel())
out.filepath_raw = os.path.join(OUT, NAME + '.png'); out.file_format = 'PNG'; out.save()
log('atlas saved', out.filepath_raw, f'coverage {covered.mean():.1%}')

# ------------------------------------------------------------------ 4. skin weights + vertex streams
BAND = 0.012
bone_trees = {}
for g, parts in groups.items():
    for b in sorted({p['bone'] for p in parts}):
        P, F, _ = soup([p for p in parts if p['bone'] == b])
        bone_trees[b] = BVHTree.FromPolygons(P.tolist(), F.tolist())

POS, NRM, UV, COL, SI, SW, IDX = [], [], [], [], [], [], []
used = set()
nverts = 0
for g, tgt in targets.items():
    me = tgt.data
    V = arrays(me)
    VN = np.empty(len(me.vertices) * 3, np.float32); me.vertex_normals.foreach_get('vector', VN); VN = VN.reshape(-1, 3)
    F = tris(me)
    lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
    uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers['UV'].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    key = np.concatenate([lv[:, None].astype(np.float64), np.round(uv.astype(np.float64) * 1e6)], 1)
    uniq, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    vi = lv[first]
    gb = sorted({p['bone'] for p in groups[g]})
    if len(gb) == 1:
        wv = np.zeros((len(V), 4), np.float32); wv[:, 0] = 1; iv = np.full((len(V), 4), gb[0], np.int32)
    else:
        dist = np.array([[bone_trees[b].find_nearest(co)[3] for b in gb] for co in V.tolist()], np.float32)
        rel = dist - dist.min(1, keepdims=True)
        w = np.clip(1 - rel / BAND, 0, 1) ** 2
        order = np.argsort(-w, 1)[:, :4]
        wv = np.take_along_axis(w, order, 1); wv /= wv.sum(1, keepdims=True)
        iv = np.array(gb, np.int32)[order]
        if len(gb) < 4: wv = np.pad(wv, ((0, 0), (0, 4 - len(gb)))); iv = np.pad(iv, ((0, 0), (0, 4 - len(gb))), constant_values=gb[0])
    POS.append(V[vi]); NRM.append(VN[vi]); UV.append(uniq[:, 1:] / 1e6); COL.append(np.ones((len(vi), 3), np.float32))
    SI.append(iv[vi]); SW.append(wv[vi]); IDX.append(inv.astype(np.int64) + nverts)  # loops are in triangle order
    used.update(int(b) for b in gb)
    nverts += len(vi)
shell_index = sum(len(i) for i in IDX)
# pass-through parts: welded, one bone each, sampling the white corner
for p in D['details']:
    pos = np.array(p['pos'], np.float32).reshape(-1, 3); nrm = np.array(p['nrm'], np.float32).reshape(-1, 3)
    c = np.array(p['col'], np.float32).reshape(-1, 3) if p.get('col') else np.ones_like(pos)
    key = np.round(np.concatenate([pos, nrm, c], 1).astype(np.float64) * 1e5)
    uniq, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    POS.append(pos[first]); NRM.append(nrm[first]); COL.append(c[first]); UV.append(np.full((len(first), 2), -1, np.float32))  # no atlas: vertex colour only
    iv = np.zeros((len(first), 4), np.int32); iv[:] = p['bone']; wv = np.zeros((len(first), 4), np.float32); wv[:, 0] = 1
    tri = np.array(p['idx'], np.int64) if p.get('idx') else np.arange(len(pos))
    SI.append(iv); SW.append(wv); IDX.append(inv.astype(np.int64)[tri] + nverts)
    used.add(int(p['bone'])); nverts += len(first)

bone_list = sorted(used); slot = {b: i for i, b in enumerate(bone_list)}
pos = np.concatenate(POS).astype('<f4'); nrm = np.concatenate(NRM)
nl = np.linalg.norm(nrm, axis=1, keepdims=True)
nrm = np.where(nl > 1e-6, nrm / np.maximum(nl, 1e-9), [0, 1, 0])  # a zero normal would be NaN in the shader and bloom spreads NaN over the frame
nrm = (nrm * 32767).round().astype('<i2')
uv = np.concatenate(UV).astype('<f4'); colr = np.concatenate(COL).astype('<f4')
si = np.vectorize(slot.get)(np.concatenate(SI)).astype('<u1')
sw = np.concatenate(SW); sw = (sw / sw.sum(1, keepdims=True) * 255).round().astype('<u1')
idx = np.concatenate(IDX).astype('<u4' if nverts > 65535 else '<u2')

layout, blob, off = [], bytearray(), 0
for nm, arr, size, norm in (('position', pos, 3, False), ('normal', nrm, 3, True), ('skinUv', uv, 2, False), ('color', colr, 3, False), ('skinIndex', si, 4, False), ('skinWeight', sw, 4, True), ('index', idx, 1, False)):
    b = arr.tobytes(); layout.append({'name': nm, 'type': arr.dtype.str[1:], 'itemSize': size, 'normalized': norm, 'offset': off, 'count': arr.size})
    blob += b; off += len(b)
    while off % 4: blob += b'\0'; off += 1
open(os.path.join(OUT, NAME + '.bin'), 'wb').write(blob)
mouth = next((p['bone'] for p in D['details'] if p.get('mouth')), -1)
meta = {'name': D['name'], 'spec': D['spec'], 'signature': D['signature'], 'tex': NAME + '.png', 'bones': bone_list, 'mouth': mouth,
        'vertexCount': nverts, 'shellIndexCount': int(shell_index), 'layout': layout, 'bin': NAME + '.bin'}
json.dump(meta, open(os.path.join(OUT, NAME + '.json'), 'w'), indent=1)
log(f'wrote {NAME}: {nverts} verts, {len(idx) // 3} tris ({shell_index // 3} fused), {len(blob) / 1e6:.2f} MB, bones {len(bone_list)}')
if KEEP_BLEND: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(SRC), NAME + '.blend'))
