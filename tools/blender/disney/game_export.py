# Bake the Disney-style Chewy into a game asset for the three.js runtime (src/actors/disneyChewy.js).
#   render.sh-style build with export=DIR: build.py builds the high-res character + rig, then calls export().
# Each part is decimated to a triangle budget and unwrapped into one atlas; Cycles bakes the painted colour (with fur
# streaks along the groom's comb direction) and a tangent normal map (fur texture, cloth folds, seams, wraps) from the
# high-res meshes, plus AO; skin weights come from the nearest high-res vertex. Coordinates go to three.js (Y up,
# facing +Z) and are scaled to the game's Chewy height.
import bpy, bmesh, math, os, json
import numpy as np
from mathutils.kdtree import KDTree

BUDGET = dict(head=40000,  # the hero's face: enough density that the lip parting and lid rims survive
               body=6000, gi=6500, pants=3000, sash=1600, scarf=1400, wraps=1600, eyes=2400, tongue=300)
TEXEL = dict(eyes=6.0, head=2.2, tongue=1.5)   # extra texel area where it is looked at
NO_OUTLINE = {'eyes', 'tongue'}                 # no ink hull round the eyeballs or the tongue
FUR = {'head', 'body'}
FUR_GAIN = 1.0  # the game's toon lighting reads the film's deep chocolate as maroon: bake the coat brighter

def to_three(P, scale):
    P = np.asarray(P, float)
    return np.stack([P[..., 0], P[..., 2], -P[..., 1]], -1) * scale

def _arr(me, attr, n, dim, dtype=np.float32):
    a = np.empty(n * dim, dtype); getattr(me, attr).foreach_get('co' if attr == 'vertices' else 'vector', a); return a.reshape(-1, dim)

def export(ctx):
    """ctx: scene, log, chewy (the character module), chrig, MESHES, MESH_W, PARTS, out, tex; the character's GAME dict
    may set name, scale, height, budget, texel, no_outline, fur, cloth, coat (module colour overrides for the bake,
    e.g. {'FUR': '#83482c'}) and repaint (part -> colour fn, for cloth colours calibrated to the game's light)."""
    scene, log, chewy, chrig = ctx['scene'], ctx['log'], ctx['chewy'], ctx['chrig']
    MESHES, MESH_W, PARTS, OUT = ctx['MESHES'], ctx['MESH_W'], ctx['PARTS'], ctx['out']
    TEX = int(ctx.get('tex', 2048)); SCALE = float(ctx.get('scale', 1.15)); name = ctx.get('name', 'chewy_disney')
    budget, texel = ctx.get('budget', BUDGET), ctx.get('texel', TEXEL)
    no_outline, fur_parts = set(ctx.get('no_outline', NO_OUTLINE)), set(ctx.get('fur', FUR))
    cloth_parts = set(ctx.get('cloth', ('gi', 'pants', 'sash', 'scarf', 'wraps')))
    coat = ctx.get('coat', {'FUR': '#83482c', 'FUR_LIGHT': '#a8683f'})
    os.makedirs(OUT, exist_ok=True)
    names = [n for n in budget if n in MESHES]

    # ---- high-res bake sources: painted colour, fur streaks along the comb, bump for the normal bake
    # the film's deep chocolate turns maroon under the game's warm toon light: repaint the coat with the classic
    # Chewy's browns (they read right in game); nose, cream, pads and clothes keep their colours
    saved = {k: getattr(chewy, k) for k in coat}
    for k, h in coat.items(): setattr(chewy, k, chewy._lin(h))
    repaint = {n: PARTS[n]['color'] for n in fur_parts}
    repaint.update({n: fn or PARTS[n]['color'] for n, fn in ctx.get('repaint', {}).items() if n in PARTS})  # None: the part's own colour fn (with the overrides)
    for n, fn in repaint.items():
        if n not in MESHES: continue
        rgb = fn(MESHES[n][0])[0]
        ca = bpy.data.objects[n].data.color_attributes['Col']
        ca.data.foreach_set('color', np.concatenate([rgb, np.ones((len(rgb), 1))], 1).astype(np.float32).ravel())
    for k, v in saved.items(): setattr(chewy, k, v)
    head_f = PARTS['head']['f']
    for n in names:
        ob = bpy.data.objects[n]; me = ob.data
        if n in fur_parts:
            Vx = MESHES[n][0]
            if n == 'head': L, comb = chewy.head_fur(chewy.to_head(Vx))[1:3]; L = L * chewy.HEAD_SCALE
            else: L, comb = chewy.body_fur(Vx, head_f)[1:3]
            comb = comb / np.maximum(np.linalg.norm(comb, axis=1, keepdims=True), 1e-9)
            a = me.attributes.new('Comb', 'FLOAT_VECTOR', 'POINT'); a.data.foreach_set('vector', comb.astype(np.float32).ravel())
        me.materials.clear(); me.materials.append(_source_material(n, n in fur_parts, n in cloth_parts))

    # ---- low-poly copies
    lows = {}
    for n in names:
        src = bpy.data.objects[n]
        me = src.data.copy(); me.materials.clear()
        ob = bpy.data.objects.new(n + '_low', me); scene.collection.objects.link(ob)
        ratio = min(1.0, budget[n] / max(len(me.polygons) * 2, 1))
        d = ob.modifiers.new('dec', 'DECIMATE'); d.decimate_type = 'COLLAPSE'; d.ratio = ratio; d.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        low = bpy.data.meshes.new_from_object(ob.evaluated_get(dg)); ob.modifiers.clear(); ob.data = low
        bm = bmesh.new(); bm.from_mesh(low); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(low); bm.free()
        low.polygons.foreach_set('use_smooth', np.ones(len(low.polygons), bool))
        lows[n] = ob
        log(f'export: {n} {len(src.data.polygons)} quads -> {len(low.polygons)} tris')

    # ---- one atlas
    tl = list(lows.values())
    for o in tl: o.data.uv_layers.new(name='UV')
    def edit(fn):
        for o in scene.objects: o.select_set(False)
        for o in tl: o.select_set(True)
        bpy.context.view_layer.objects.active = tl[0]
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.select_all(action='SELECT')
        fn(); bpy.ops.object.mode_set(mode='OBJECT')
    edit(lambda: bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False))
    edit(lambda: bpy.ops.uv.average_islands_scale())
    for n, o in lows.items():
        k = math.sqrt(texel.get(n, 1.0))
        if k != 1:
            uvl = o.data.uv_layers['UV']; uv = np.empty(len(uvl.data) * 2, np.float32); uvl.data.foreach_get('uv', uv)
            uvl.data.foreach_set('uv', (uv * k).ravel())
    edit(lambda: bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=0.002, scale=True))
    log('export: atlas packed')

    # ---- bakes: colour (emit) and tangent normals from the high-res part, AO over the low-poly character
    scene.render.engine = 'CYCLES'; bk = scene.render.bake
    bk.margin = 0; bk.use_clear = True
    for o in scene.objects:
        if o.type == 'CURVES': o.hide_render = True   # the groom is baked as texture, not as occluders
    imgs = {}
    for n, o in lows.items():
        imgs[n] = {k: bpy.data.images.new(f'{n}_{k}', TEX, TEX, alpha=True, float_buffer=True) for k in ('col', 'nrm', 'ao')}
        m = bpy.data.materials.new(n + '_bake'); m.use_nodes = True
        tn = m.node_tree.nodes.new('ShaderNodeTexImage'); m.node_tree.nodes.active = tn
        o.data.materials.append(m)
    def bake(n, kind, img):
        lows[n].data.materials[0].node_tree.nodes.active.image = img
        bpy.ops.object.bake(type=kind)
    scene.cycles.samples = 16
    bk.use_selected_to_active = True; bk.cage_extrusion = 0.0025; bk.max_ray_distance = 0.008  # short rays: no picking up the tongue or the other lip
    for n, o in lows.items():
        for ob in scene.objects: ob.select_set(False)
        bpy.data.objects[n].select_set(True); o.select_set(True); bpy.context.view_layer.objects.active = o
        bake(n, 'EMIT', imgs[n]['col'])
        bk.normal_space = 'TANGENT'
        bake(n, 'NORMAL', imgs[n]['nrm'])
    log('export: colour + normals baked')
    for n in names: bpy.data.objects[n].hide_render = True
    scene.world.light_settings.distance = 0.12; scene.cycles.samples = 128; bk.use_selected_to_active = False
    for n, o in lows.items():
        for ob in scene.objects: ob.select_set(False)
        o.select_set(True); bpy.context.view_layer.objects.active = o
        bake(n, 'AO', imgs[n]['ao'])
    log('export: AO baked')

    # ---- composite the atlas
    def px(img):
        a = np.empty(TEX * TEX * 4, np.float32); img.pixels.foreach_get(a); return a.reshape(TEX, TEX, 4)
    col = np.zeros((TEX, TEX, 3), np.float32); nrm = np.tile(np.array([0.5, 0.5, 1.0], np.float32), (TEX, TEX, 1))
    ao = np.ones((TEX, TEX), np.float32); cov = np.zeros((TEX, TEX), bool)
    for n, o in lows.items():
        m = _uv_mask(o.data, TEX); cov |= m
        col[m] = px(imgs[n]['col'])[m][:, :3]; nrm[m] = px(imgs[n]['nrm'])[m][:, :3]; ao[m] = px(imgs[n]['ao'])[m][:, 0]
    tint = np.array([0.42, 0.36, 0.62], np.float32)
    col *= (0.5 + 0.5 * (tint + (1 - tint) * ao[..., None]))
    col, nrm = _dilate(col, cov), _dilate(nrm, cov, fill=(0.5, 0.5, 1.0))
    srgb = np.where(col <= 0.0031308, col * 12.92, 1.055 * np.power(np.clip(col, 0, None), 1 / 2.4) - 0.055)
    _save_png(os.path.join(OUT, name + '.png'), srgb, TEX)
    # the normal map at half size (fur and fold detail barely registers at the game camera; halves the download)
    n2 = nrm.reshape(TEX // 2, 2, TEX // 2, 2, 3).mean((1, 3)) * 2 - 1
    n2 = n2 / np.maximum(np.linalg.norm(n2, axis=-1, keepdims=True), 1e-6) * 0.5 + 0.5
    _save_png(os.path.join(OUT, name + '_n.png'), n2, TEX // 2)
    log(f'export: atlas saved ({cov.mean():.0%} used)')

    # ---- vertex streams + skeleton
    defs = chrig.bone_defs(); bnames = [d[0] for d in defs]; bidx = {b: i for i, b in enumerate(bnames)}
    POS, NRM, UV, SI, SW, IDX = [], [], [], [], [], []
    base, outline_count = 0, 0
    order = [n for n in names if n not in no_outline] + [n for n in names if n in no_outline]
    for n in order:
        me = lows[n].data; hv = MESHES[n][0]; W = MESH_W[n]
        V = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
        VN = np.empty(len(me.vertices) * 3, np.float32); me.vertex_normals.foreach_get('vector', VN); VN = VN.reshape(-1, 3)
        lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
        uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers['UV'].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
        key = np.concatenate([lv[:, None].astype(np.float64), np.round(uv.astype(np.float64) * 1e6)], 1)
        uniq, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
        vi = lv[first]
        kd = KDTree(len(hv))
        for i, co in enumerate(hv): kd.insert(co, i)
        kd.balance()
        if n == 'head':  # the face weights are a function of position: evaluate them on the game mesh itself
            W = chrig.face_weights(V[vi].astype(np.float64)); near = np.arange(len(vi))
        else:
            near = np.array([kd.find(co)[1] for co in V[vi]])
        wn = [b for b in W if W[b].any()]
        while len(wn) < 4: wn.append('root')  # parts with fewer influences (eyes, tongue): pad with empty slots
        Wm = np.stack([W[b][near] if b in W else np.zeros(len(near)) for b in wn], 1)
        top = np.argsort(-Wm, 1)[:, :4]
        w4 = np.take_along_axis(Wm, top, 1); w4 /= np.maximum(w4.sum(1, keepdims=True), 1e-9)
        i4 = np.array([bidx[b] for b in wn])[top]
        POS.append(to_three(V[vi], SCALE)); NRM.append(to_three(VN[vi], 1.0)); UV.append(uniq[:, 1:] / 1e6)
        SI.append(i4); SW.append(w4); IDX.append(inv.astype(np.int64).ravel() + base)
        base += len(vi)
        if n not in no_outline: outline_count += len(inv.ravel())
    pos = np.concatenate(POS).astype('<f4')
    nrmv = np.concatenate(NRM); nrmv /= np.maximum(np.linalg.norm(nrmv, axis=1, keepdims=True), 1e-9)
    nrmv = (nrmv * 32767).round().astype('<i2')
    uvs = np.concatenate(UV).astype('<f4')
    si = np.concatenate(SI).astype('<u1'); sw = (np.concatenate(SW) * 255).round().astype('<u1')
    idx = np.concatenate(IDX).astype('<u4')
    layout, blob, off = [], bytearray(), 0
    for nm, arr, size, normd in (('position', pos, 3, False), ('normal', nrmv, 3, True), ('uv', uvs, 2, False),
                                  ('skinIndex', si, 4, False), ('skinWeight', sw, 4, True), ('index', idx, 1, False)):
        b = arr.tobytes(); layout.append({'name': nm, 'type': arr.dtype.str[1:], 'itemSize': size, 'normalized': normd, 'offset': off, 'count': arr.size})
        blob += b; off += len(b)
        while off % 4: blob += b'\0'; off += 1
    open(os.path.join(OUT, name + '.bin'), 'wb').write(blob)
    bones = [{'name': b, 'parent': par, 'pos': to_three(h, SCALE).round(5).tolist()} for b, h, t, par, up in defs]
    meta = {'name': name, 'scale': SCALE, 'height': round(float(ctx.get('height', 1.05)) * SCALE, 3), 'bones': bones, 'layout': layout,
            'vertexCount': int(base), 'outlineIndexCount': int(outline_count), 'bin': name + '.bin',
            'tex': name + '.png', 'normalTex': name + '_n.png'}
    json.dump(meta, open(os.path.join(OUT, name + '.json'), 'w'), indent=1)
    log(f'export: wrote {name}: {base} verts, {len(idx) // 3} tris, {len(blob) / 1e6:.1f} MB')

def _source_material(n, fur, cloth):
    m = bpy.data.materials.new(n + '_src'); m.use_nodes = True; nt = m.node_tree; L = nt.links
    b = nt.nodes['Principled BSDF']
    col = nt.nodes.new('ShaderNodeAttribute'); col.attribute_name = 'Col'
    color = col.outputs['Color']
    if fur:  # streaks along the comb: noise that does not change along the fur direction
        geo = nt.nodes.new('ShaderNodeNewGeometry'); comb = nt.nodes.new('ShaderNodeAttribute'); comb.attribute_name = 'Comb'
        dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
        L.new(geo.outputs['Position'], dot.inputs[0]); L.new(comb.outputs['Vector'], dot.inputs[1])
        sc = nt.nodes.new('ShaderNodeVectorMath'); sc.operation = 'SCALE'
        L.new(comb.outputs['Vector'], sc.inputs[0]); L.new(dot.outputs['Value'], sc.inputs['Scale'])
        sub = nt.nodes.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'
        L.new(geo.outputs['Position'], sub.inputs[0]); L.new(sc.outputs[0], sub.inputs[1])
        noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 320; noise.inputs['Detail'].default_value = 2  # coarse enough not to alias in game
        L.new(sub.outputs[0], noise.inputs['Vector'])
        k = nt.nodes.new('ShaderNodeMapRange'); k.inputs['To Min'].default_value = 0.8 * FUR_GAIN; k.inputs['To Max'].default_value = 1.18 * FUR_GAIN
        L.new(noise.outputs['Fac'], k.inputs['Value'])
        mix = nt.nodes.new('ShaderNodeVectorMath'); mix.operation = 'SCALE'
        L.new(color, mix.inputs[0]); L.new(k.outputs['Result'], mix.inputs['Scale'])
        color = mix.outputs[0]
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = 0.0008
        L.new(noise.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    elif cloth:  # weave
        n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 900; n2.inputs['Detail'].default_value = 2
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.12; bump.inputs['Distance'].default_value = 0.0004
        L.new(n2.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    L.new(color, b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 1.0
    return m

def _uv_mask(me, TEX):
    uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers['UV'].data.foreach_get('uv', uv)
    mask = np.zeros((TEX, TEX), bool)
    for t in uv.reshape(-1, 3, 2) * TEX - 0.5:
        lo = np.maximum(np.floor(t.min(0)).astype(int), 0); hi = np.minimum(np.ceil(t.max(0)).astype(int), TEX - 1)
        if (hi < lo).any(): continue
        xs, ys = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
        (ax, ay), (bx, by), (cx, cy) = t
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12: continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
        inside = (l1 >= -1e-4) & (l2 >= -1e-4) & (1 - l1 - l2 >= -1e-4)
        mask[ys[inside], xs[inside]] = True
    return mask

def _dilate(img, cov, it=10, fill=(1, 1, 1)):
    img = img.copy(); filled = cov.copy(); H, W = cov.shape
    def sh(a, dy, dx):
        o = np.zeros_like(a)
        o[max(dy, 0):H + min(dy, 0), max(dx, 0):W + min(dx, 0)] = a[max(-dy, 0):H + min(-dy, 0), max(-dx, 0):W + min(-dx, 0)]
        return o
    for _ in range(it):
        acc = np.zeros_like(img); cnt = np.zeros(cov.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            f = sh(filled, dy, dx); acc += sh(img, dy, dx) * f[..., None]; cnt += f
        g = (~filled) & (cnt > 0); img[g] = acc[g] / cnt[g][:, None]; filled |= g
    img[~filled] = fill
    return img

def _save_png(path, rgb, TEX):
    im = bpy.data.images.new(os.path.basename(path), TEX, TEX, alpha=True)
    im.colorspace_settings.name = 'Non-Color'
    a = np.ones((TEX, TEX, 4), np.float32); a[..., :3] = np.clip(rgb, 0, 1)
    im.pixels.foreach_set(a.ravel()); im.filepath_raw = path; im.file_format = 'PNG'; im.save()
